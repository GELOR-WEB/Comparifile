import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Loader2, AlertCircle } from 'lucide-react';

// ==================== File Drop Zone Component ====================
const FileDropZone = ({ file, setFile }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputId = useRef(`file-input-${Date.now()}`);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e) => {
    if (e.target.files.length) setFile(e.target.files[0]);
  };

  const dropzoneStyle = {
    border: isDragging ? '2px solid #2563eb' : '2px dashed #d1d5db',
    borderRadius: '8px',
    padding: '32px',
    textAlign: 'center',
    cursor: 'pointer',
    background: isDragging ? '#e0f2fe' : 'white',
    transition: 'all 0.2s',
  };

  return (
    <div
      style={dropzoneStyle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => document.getElementById(inputId.current).click()}
    >
      <Upload style={{ margin: '0 auto 12px display: block', color: isDragging ? '#2563eb' : '#9ca3af' }} size={48} />
      <p style={{ color: '#4b5563', marginBottom: '8px', fontWeight: '600' }}>
        {isDragging ? 'Drop file here' : 'Click to upload or drag & drop'}
      </p>
      <p style={{ fontSize: '12px', color: '#9ca3af' }}>PDF, DOCX, DOC, PNG, JPG, JPEG</p>
      <input
        type="file"
        id={inputId.current}
        style={{ display: 'none' }}
        accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
        onChange={handleFileInput}
      />
    </div>
  );
};

// ==================== Main Component ====================
const VisualDocumentComparator = () => {
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfjsLoading, setPdfjsLoading] = useState(true); // starts as loading
  const [pdfjsError, setPdfjsError] = useState(false);

  const canvasRef1 = useRef(null);
  const canvasRef2 = useRef(null);
  const diffCanvasRef = useRef(null);

  // Load pdf.js dynamically with better feedback
  useEffect(() => {
    if (window.pdfjsLib) {
      setPdfjsLoading(false);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.min.js';
    script.async = true;
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.js';
      setPdfjsLoading(false);
    };
    script.onerror = () => {
      setPdfjsLoading(false);
      setPdfjsError(true);
      setError('Failed to load PDF processing library. PDF comparison will not work.');
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Extract full text from PDF
  const extractTextFromPDF = async (file) => {
    if (!window.pdfjsLib) throw new Error('PDF library not available');
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
  };

  // Render PDF page 1 and apply highlights
  const renderAndHighlightPDF = async (file, canvas, removedWords, addedWords) => {
    if (!window.pdfjsLib) throw new Error('PDF library not available');
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const MAX_WIDTH = 550;
    const originalViewport = page.getViewport({ scale: 1 });
    const scale = MAX_WIDTH / originalViewport.width;
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const textContent = await page.getTextContent();

    textContent.items.forEach((item) => {
      const word = item.str.toLowerCase().trim();
      if (word.length <= 1) return;

      let color = null;
      if (removedWords.has(word)) color = 'rgba(255, 0, 0, 0.4)';
      if (addedWords.has(word)) color = 'rgba(0, 255, 0, 0.4)';

      if (color) {
        const tx = item.transform[4];
        const ty = item.transform[5];

        const x = tx * scale;
        const y = (originalViewport.height - ty) * scale;

        const width = item.width * scale;
        const height = (item.height || 20) * scale;

        ctx.fillStyle = color;
        ctx.fillRect(x, y - height * 0.8, width, height);
      }
    });
  };

  const highlightPDFDifferences = async (file1, file2, canvas1, canvas2) => {
    const text1 = await extractTextFromPDF(file1);
    const text2 = await extractTextFromPDF(file2);

    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 1));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 1));

    const removed = new Set([...words1].filter(w => !words2.has(w)));
    const added   = new Set([...words2].filter(w => !words1.has(w)));

    await Promise.all([
      renderAndHighlightPDF(file1, canvas1, removed, new Set()),
      renderAndHighlightPDF(file2, canvas2, new Set(), added)
    ]);
  };

  // Image functions (unchanged)
  const loadImageToCanvas = (file, canvas) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve();
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const compareImages = (canvas1, canvas2, diffCanvas) => {
    const ctx1 = canvas1.getContext('2d');
    const ctx2 = canvas2.getContext('2d');
    const ctxDiff = diffCanvas.getContext('2d');

    let width = Math.min(canvas1.width, canvas2.width);
    let height = Math.min(canvas1.height, canvas2.height);

    canvas1.width = canvas2.width = diffCanvas.width = width;
    canvas1.height = canvas2.height = diffCanvas.height = height;

    const data1 = ctx1.getImageData(0, 0, width, height).data;
    const data2 = ctx2.getImageData(0, 0, width, height).data;
    const diffImage = ctxDiff.createImageData(width, height);

    let diffCount = 0;
    const threshold = 30;

    for (let i = 0; i < data1.length; i += 4) {
      const diffR = Math.abs(data1[i] - data2[i]);
      const diffG = Math.abs(data1[i + 1] - data2[i + 1]);
      const diffB = Math.abs(data1[i + 2] - data2[i + 2]);

      if (diffR > threshold || diffG > threshold || diffB > threshold) {
        diffImage.data[i] = 255;
        diffImage.data[i + 1] = 0;
        diffImage.data[i + 2] = 0;
        diffImage.data[i + 3] = 255;
        diffCount++;
      } else {
        diffImage.data[i] = data1[i];
        diffImage.data[i + 1] = data1[i + 1];
        diffImage.data[i + 2] = data1[i + 2];
        diffImage.data[i + 3] = 255;
      }
    }

    ctxDiff.putImageData(diffImage, 0, 0);
    const similarity = ((width * height - diffCount) / (width * height) * 100).toFixed(1);
    return { diffPixels: diffCount, similarity };
  };

  // Mammoth functions (unchanged)
  const loadMammoth = async () => {
    if (!window.mammoth) {
      const res = await fetch('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
      const code = await res.text();
      eval(code);
    }
  };

  const extractTextFromWord = async (file) => {
    await loadMammoth();
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  const renderWordToHTML = async (file) => {
    await loadMammoth();
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.convertToHtml({ arrayBuffer });
    return result.value;
  };

  const highlightWordDifferences = (html1, html2, text1, text2) => {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    let h1 = html1;
    let h2 = html2;

    [...words1].filter(w => !words2.has(w)).forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      h1 = h1.replace(regex, `<span style="background-color:rgba(255,0,0,0.4);padding:2px;border-radius:3px;">$&</span>`);
    });

    [...words2].filter(w => !words1.has(w)).forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      h2 = h2.replace(regex, `<span style="background-color:rgba(0,255,0,0.4);padding:2px;border-radius:3px;">$&</span>`);
    });

    return { highlightedHtml1: h1, highlightedHtml2: h2 };
  };

  const handleCompare = async () => {
    if (!file1 || !file2) return;

    setLoading(true);
    setError('');
    setComparison(null);

    try {
      const ext1 = file1.name.split('.').pop().toLowerCase();
      const ext2 = file2.name.split('.').pop().toLowerCase();

      if (ext1 !== ext2) {
        throw new Error('Both files must have the same file type');
      }

      if (ext1 === 'pdf') {
        if (pdfjsLoading) {
          throw new Error('PDF library is still loading. Please wait a moment and try again.');
        }
        if (pdfjsError) {
          throw new Error('PDF library failed to load. PDF comparison is unavailable.');
        }
        setComparison({ type: 'pdf' });
      } else if (['docx', 'doc'].includes(ext1)) {
        const [text1, text2, html1, html2] = await Promise.all([
          extractTextFromWord(file1),
          extractTextFromWord(file2),
          renderWordToHTML(file1),
          renderWordToHTML(file2),
        ]);
        const { highlightedHtml1, highlightedHtml2 } = highlightWordDifferences(html1, html2, text1, text2);
        setComparison({ type: 'word', html1: highlightedHtml1, html2: highlightedHtml2 });
      } else if (['png', 'jpg', 'jpeg'].includes(ext1)) {
        setComparison({ type: 'image' });
      } else {
        throw new Error('Unsupported file type');
      }
    } catch (err) {
      setError(err.message || 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!comparison || !file1 || !file2) return;

    const render = async () => {
      try {
        if (comparison.type === 'pdf') {
          await highlightPDFDifferences(file1, file2, canvasRef1.current, canvasRef2.current);
        } else if (comparison.type === 'image') {
          await loadImageToCanvas(file1, canvasRef1.current);
          await loadImageToCanvas(file2, canvasRef2.current);
          const { diffPixels, similarity } = compareImages(
            canvasRef1.current,
            canvasRef2.current,
            diffCanvasRef.current
          );
          setComparison(prev => ({ ...prev, diffPixels, similarity }));
        }
      } catch (err) {
        setError('Failed to render comparison: ' + err.message);
      }
    };

    render();
  }, [comparison, file1, file2]);

  const isPdfComparison = file1 && file2 && file1.name.toLowerCase().endsWith('.pdf') && file2.name.toLowerCase().endsWith('.pdf');

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)' }}>
      <div style={{ maxWidth: '896px', margin: '0 auto', padding: '24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#1f2937' }}>
            Visual Document Comparator
          </h1>
          <p style={{ color: '#4b5563' }}>Upload two documents to see visual differences highlighted</p>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>Supports PDF, Word (.docx), and Images</p>
        </div>

        {/* PDF Loading Warning */}
        {pdfjsLoading && isPdfComparison && (
          <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle color="#d97706" size={24} />
            <p style={{ color: '#92400e', margin: 0 }}>
              PDF library is still loading. Please wait a moment and try again.
            </p>
          </div>
        )}

        {/* General Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <p style={{ color: '#991b1b' }}>{error}</p>
          </div>
        )}

        {/* Upload Zones */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText color="#2563eb" /> Document 1
            </h3>
            <FileDropZone file={file1} setFile={setFile1} />
            {file1 && (
              <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', borderRadius: '8px' }}>
                <p style={{ fontSize: '14px', color: '#166534', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file1.name}
                </p>
              </div>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText color="#2563eb" /> Document 2
            </h3>
            <FileDropZone file={file2} setFile={setFile2} />
            {file2 && (
              <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', borderRadius: '8px' }}>
                <p style={{ fontSize: '14px', color: '#166534', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file2.name}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Compare Button */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleCompare}
            disabled={!file1 || !file2 || loading || (isPdfComparison && pdfjsLoading)}
            style={{
              padding: '16px 32px',
              background: (file1 && file2 && !loading && !(isPdfComparison && pdfjsLoading)) ? '#2563eb' : '#d1d5db',
              color: 'white',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '18px',
              border: 'none',
              cursor: (file1 && file2 && !loading && !(isPdfComparison && pdfjsLoading)) ? 'pointer' : 'not-allowed',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              margin: '0 auto'
            }}
          >
            {loading ? (
              <>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                Comparing...
              </>
            ) : (
              'Compare Documents'
            )}
          </button>
        </div>

        {/* Results - unchanged from previous version */}
        {comparison && (
          <div style={{ marginTop: '48px' }}>
            {/* ... (same PDF, Word, Image results rendering as in the last full version) */}
            {comparison.type === 'pdf' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <p style={{ fontSize: '18px', fontWeight: '600', color: '#374151' }}>PDF Comparison (First Page)</p>
                  <p style={{ marginTop: '8px', color: '#4b5563' }}>
                    <span style={{ display: 'inline-block', width: '16px', height: '16px', background: 'rgba(255,0,0,0.4)', borderRadius: '3px', marginRight: '8px' }}></span>
                    Red = Removed 
                    <span style={{ display: 'inline-block', width: '16px', height: '16px', background: 'rgba(0,255,0,0.4)', borderRadius: '3px', margin: '0 8px' }}></span>
                    Green = Added
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                  <div>
                    <h3 style={{ textAlign: 'center', marginBottom: '12px', fontWeight: '600', color: '#374151' }}>{file1.name}</h3>
                    <canvas ref={canvasRef1} style={{ width: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                  </div>
                  <div>
                    <h3 style={{ textAlign: 'center', marginBottom: '12px', fontWeight: '600', color: '#374151' }}>{file2.name}</h3>
                    <canvas ref={canvasRef2} style={{ width: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                  </div>
                </div>
              </div>
            )}

            {comparison.type === 'word' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <p style={{ fontSize: '18px', fontWeight: '600', color: '#374151' }}>Word Document Comparison</p>
                  <p style={{ marginTop: '8px', color: '#4b5563' }}>
                    <span style={{ display: 'inline-block', width: '16px', height: '16px', background: 'rgba(255,0,0,0.4)', borderRadius: '3px', marginRight: '8px' }}></span>
                    Red = Removed 
                    <span style={{ display: 'inline-block', width: '16px', height: '16px', background: 'rgba(0,255,0,0.4)', borderRadius: '3px', margin: '0 8px' }}></span>
                    Green = Added
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                  <div>
                    <h3 style={{ textAlign: 'center', marginBottom: '12px', fontWeight: '600', color: '#374151' }}>{file1.name}</h3>
                    <div style={{ background: 'white', padding: '24px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '800px', overflow: 'auto' }}
                      dangerouslySetInnerHTML={{ __html: comparison.html1 }} />
                  </div>
                  <div>
                    <h3 style={{ textAlign: 'center', marginBottom: '12px', fontWeight: '600', color: '#374151' }}>{file2.name}</h3>
                    <div style={{ background: 'white', padding: '24px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '800px', overflow: 'auto' }}
                      dangerouslySetInnerHTML={{ __html: comparison.html2 }} />
                  </div>
                </div>
              </div>
            )}

            {comparison.type === 'image' && (
              <div>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  <p style={{ fontSize: '20px', fontWeight: '600', color: '#374151' }}>
                    Similarity: {comparison.similarity ? `${comparison.similarity}%` : 'Calculating...'}
                  </p>
                  {comparison.diffPixels !== undefined && (
                    <p style={{ color: '#6b7280', marginTop: '8px' }}>
                      Different pixels: {comparison.diffPixels.toLocaleString()}
                    </p>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
                  <div>
                    <h3 style={{ textAlign: 'center', marginBottom: '12px', fontWeight: '600', color: '#374151' }}>{file1.name}</h3>
                    <canvas ref={canvasRef1} style={{ width: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                  </div>
                  <div>
                    <h3 style={{ textAlign: 'center', marginBottom: '12px', fontWeight: '600', color: '#374151' }}>{file2.name}</h3>
                    <canvas ref={canvasRef2} style={{ width: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                  </div>
                  <div>
                    <h3 style={{ textAlign: 'center', marginBottom: '12px', fontWeight: '600', color: '#dc2626' }}>Differences</h3>
                    <canvas ref={diffCanvasRef} style={{ width: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* How it works - unchanged */}
        <div style={{ marginTop: '48px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px' }}>
          <h3 style={{ fontWeight: '600', color: '#374151', marginBottom: '12px' }}>How it works</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li style={{ marginBottom: '8px', color: '#4b5563' }}>• <strong>PDFs:</strong> First page rendered with removed (red) and added (green) text highlighted</li>
            <li style={{ marginBottom: '8px', color: '#4b5563' }}>• <strong>Word (.docx):</strong> Full formatted content with color-coded word differences</li>
            <li style={{ color: '#4b5563' }}>• <strong>Images:</strong> Side-by-side view + pixel difference overlay with similarity score</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default VisualDocumentComparator;