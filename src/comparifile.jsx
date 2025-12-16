import React, { useState, useRef, useCallback } from 'react';
import { Upload, ArrowLeft, FileText } from 'lucide-react';

// --- NEW FILE DROP ZONE COMPONENT ---
const FileDropZone = ({ file, setFile }) => {
    const [isDragging, setIsDragging] = useState(false);

    // Prevents default browser behavior (e.g., opening the file in a new tab)
    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles.length) {
            setFile(droppedFiles[0]);
        }
    }, [setFile]);

    const handleFileInput = useCallback((e) => {
        if (e.target.files.length) {
            setFile(e.target.files[0]);
        }
    }, [setFile]);

    const inputId = useRef(`file-input-${Date.now()}`);

    const dropzoneStyle = {
        border: isDragging ? '2px solid #2563eb' : '2px dashed #d1d5db',
        borderRadius: '8px',
        padding: '32px',
        textAlign: 'center',
        cursor: 'pointer',
        background: isDragging ? '#e0f2fe' : 'white',
        transition: 'border-color 0.2s, background 0.2s',
    };

    return (
        <div
            style={dropzoneStyle}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById(inputId.current).click()}
        >
            <Upload style={{ margin: '0 auto 12px', color: isDragging ? '#2563eb' : '#9ca3af' }} size={48} />
            <p style={{ color: '#4b5563', marginBottom: '8px', fontWeight: '600' }}>
                {isDragging ? 'Drop file here' : 'Click to upload or drag and drop'}
            </p>
            <p style={{ fontSize: '12px', color: '#9ca3af' }}>PDF, DOCX, or Image</p>
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

// --- MAIN COMPONENT ---
const VisualDocumentComparator = () => {
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canvasRef1 = useRef(null);
  const canvasRef2 = useRef(null);
  const diffCanvasRef = useRef(null);

  const extractTextFromPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  };

  const renderPDFToCanvas = async (file, canvas) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    // Using a slightly smaller scale to fit common screens well
    const MAX_WIDTH = 550;
    const viewportDefault = page.getViewport({ scale: 1 });
    const scale = MAX_WIDTH / viewportDefault.width;
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;

    return { pdf, page, viewport, context };
  };

  const highlightPDFDifferences = async (file1, file2, canvas1, canvas2) => {
    const text1 = await extractTextFromPDF(file1);
    const text2 = await extractTextFromPDF(file2);

    const render1 = await renderPDFToCanvas(file1, canvas1);
    const render2 = await renderPDFToCanvas(file2, canvas2);

    const textContent1 = await render1.page.getTextContent();
    const textContent2 = await render2.page.getTextContent();

    const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    
    const set2 = new Set(words2);
    const set1 = new Set(words1);

    // Highlight words present in 1 but not 2 (Removed/Red)
    textContent1.items.forEach((item) => {
        const word = item.str.toLowerCase().trim();
      if (!set2.has(word) && word.length > 1) {
        const transform = item.transform;
        const x = transform[4];
        const y = transform[5];

        // Apply scaling from render1
        const scale = canvas1.width / render1.viewport.width;
        const scaledY = y * scale;
        const scaledX = x * scale;
        const rectHeight = item.height * scale || 20;

        render1.context.fillStyle = 'rgba(255, 0, 0, 0.4)';
        render1.context.fillRect(scaledX, canvas1.height - scaledY - rectHeight * 0.8, item.width * scale || 50, rectHeight);
      }
    });

    // Highlight words present in 2 but not 1 (Added/Green)
    textContent2.items.forEach((item) => {
        const word = item.str.toLowerCase().trim();
      if (!set1.has(word) && word.length > 1) {
        const transform = item.transform;
        const x = transform[4];
        const y = transform[5];
        
        // Apply scaling from render2
        const scale = canvas2.width / render2.viewport.width;
        const scaledY = y * scale;
        const scaledX = x * scale;
        const rectHeight = item.height * scale || 20;

        render2.context.fillStyle = 'rgba(0, 255, 0, 0.4)';
        render2.context.fillRect(scaledX, canvas2.height - scaledY - rectHeight * 0.8, item.width * scale || 50, rectHeight);
      }
    });
  };

  const extractTextFromWord = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const response = await fetch('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
    const mammothCode = await response.text();
    // eslint-disable-next-line no-eval
    eval(mammothCode);
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  const renderWordToHTML = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    if (!window.mammoth) {
      const response = await fetch('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
      const mammothCode = await response.text();
      // eslint-disable-next-line no-eval
      eval(mammothCode);
    }
    const result = await window.mammoth.convertToHtml({ arrayBuffer });
    return result.value;
  };

  const highlightWordDifferences = (html1, html2, text1, text2) => {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    let highlightedHtml1 = html1;
    words1.forEach(word => {
      if (!set2.has(word) && word.length > 2) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        highlightedHtml1 = highlightedHtml1.replace(regex,
          `<span style="background-color: rgba(255, 0, 0, 0.4); padding: 2px; border-radius: 3px;">$&</span>`);
      }
    });

    let highlightedHtml2 = html2;
    words2.forEach(word => {
      if (!set1.has(word) && word.length > 2) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        highlightedHtml2 = highlightedHtml2.replace(regex,
          `<span style="background-color: rgba(0, 255, 0, 0.4); padding: 2px; border-radius: 3px;">$&</span>`);
      }
    });

    return { highlightedHtml1, highlightedHtml2 };
  };

  const compareImages = (canvas1, canvas2, diffCanvas) => {
    const ctx1 = canvas1.getContext('2d');
    const ctx2 = canvas2.getContext('2d');
    const ctxDiff = diffCanvas.getContext('2d');

    const imageData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
    const imageData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);
    const diffData = ctxDiff.createImageData(canvas1.width, canvas1.height);

    let diffPixels = 0;

    for (let i = 0; i < imageData1.data.length; i += 4) {
      const diff = Math.abs(imageData1.data[i] - imageData2.data[i]) +
        Math.abs(imageData1.data[i + 1] - imageData2.data[i + 1]) +
        Math.abs(imageData1.data[i + 2] - imageData2.data[i + 2]);

      if (diff > 30) {
        diffData.data[i] = 255;
        diffData.data[i + 1] = 0;
        diffData.data[i + 2] = 0;
        diffData.data[i + 3] = 255;
        diffPixels++;
      } else {
        diffData.data[i] = imageData1.data[i];
        diffData.data[i + 1] = imageData1.data[i + 1];
        diffData.data[i + 2] = imageData1.data[i + 2];
        diffData.data[i + 3] = imageData1.data[i + 3];
      }
    }

    ctxDiff.putImageData(diffData, 0, 0);

    const totalPixels = imageData1.data.length / 4;
    const similarity = ((totalPixels - diffPixels) / totalPixels * 100).toFixed(2);

    return { similarity, diffPixels };
  };

  const loadImageToCanvas = (file, canvas) => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.src = url;
    });
  };

  const loadPDFJS = () => {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load PDF.js library.'));
      document.head.appendChild(script);
    });
  };

  const handleCompare = async () => {
    if (!file1 || !file2) {
      setError('Please upload both files');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const type1 = file1.type;
      const type2 = file2.type;

      if (type1.includes('pdf') && type2.includes('pdf')) {
        await loadPDFJS();
        await highlightPDFDifferences(file1, file2, canvasRef1.current, canvasRef2.current);
        setComparison({ type: 'pdf' });
      } else if (
        (type1.includes('word') || type1.includes('document')) &&
        (type2.includes('word') || type2.includes('document'))
      ) {
        const [html1, html2, text1, text2] = await Promise.all([
          renderWordToHTML(file1),
          renderWordToHTML(file2),
          extractTextFromWord(file1),
          extractTextFromWord(file2)
        ]);

        const { highlightedHtml1, highlightedHtml2 } = highlightWordDifferences(html1, html2, text1, text2);
        setComparison({ type: 'word', html1: highlightedHtml1, html2: highlightedHtml2 });
      } else if (type1.includes('image') && type2.includes('image')) {
        await loadImageToCanvas(file1, canvasRef1.current);
        await loadImageToCanvas(file2, canvasRef2.current);

        diffCanvasRef.current.width = canvasRef1.current.width;
        diffCanvasRef.current.height = canvasRef1.current.height;

        const result = compareImages(canvasRef1.current, canvasRef2.current, diffCanvasRef.current);
        setComparison({ type: 'image', ...result });
      } else {
        setError('Both files must be of the same type (PDF, Word, or Image)');
      }
    } catch (err) {
      setError('Error comparing files: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ➡️ REMOVED handleFileUpload

  const reset = () => {
    setFile1(null);
    setFile2(null);
    setComparison(null);
    setError('');
  };

  if (comparison) {
    return (
      // Full screen container, removing padding here and adding it to the content wrapper
      <div style={{ minHeight: '100vh', width: '100%', background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)' }}>
        {/* Content wrapper with max width and padding */}
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px' }}>
          <button
            onClick={reset}
            style={{
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: 'white',
              borderRadius: '8px',
              border: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              color: '#2563eb',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={20} /> Back to Upload
          </button>

          <h2 style={{ fontSize: '30px', fontWeight: 'bold', marginBottom: '24px', textAlign: 'center', color: '#1f2937' }}>
            Visual Comparison Results
          </h2>

          {comparison.type === 'pdf' && (
            <div>
              <div style={{ background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <p style={{ textAlign: 'center', color: '#4b5563' }}>
                  <span style={{ display: 'inline-block', width: '16px', height: '16px', background: 'rgba(255,0,0,0.4)', marginRight: '8px', borderRadius: '3px' }}></span>
                  Red highlights = Removed text
                  <span style={{ display: 'inline-block', width: '16px', height: '16px', background: 'rgba(0,255,0,0.4)', marginLeft: '16px', marginRight: '8px', borderRadius: '3px' }}></span>
                  Green highlights = Added text
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>{file1.name} (Base)</h3>
                  <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '8px', maxHeight: '800px', overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
                    <canvas ref={canvasRef1} style={{ width: '100%', height: 'auto', display: 'block' }} />
                  </div>
                </div>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>{file2.name} (Compared)</h3>
                  <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '8px', maxHeight: '800px', overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
                    <canvas ref={canvasRef2} style={{ width: '100%', height: 'auto', display: 'block' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {comparison.type === 'word' && (
            <div>
              <div style={{ background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <p style={{ textAlign: 'center', color: '#4b5563' }}>
                  <span style={{ display: 'inline-block', width: '16px', height: '16px', background: 'rgba(255,0,0,0.4)', marginRight: '8px', borderRadius: '3px' }}></span>
                  Red highlights = Removed text
                  <span style={{ display: 'inline-block', width: '16px', height: '16px', background: 'rgba(0,255,0,0.4)', marginLeft: '16px', marginRight: '8px', borderRadius: '3px' }}></span>
                  Green highlights = Added text
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>{file1.name}</h3>
                  <div
                    style={{ background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px', maxHeight: '800px', overflow: 'auto' }}
                    dangerouslySetInnerHTML={{ __html: comparison.html1 }}
                  />
                </div>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>{file2.name}</h3>
                  <div
                    style={{ background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px', maxHeight: '800px', overflow: 'auto' }}
                    dangerouslySetInnerHTML={{ __html: comparison.html2 }}
                  />
                </div>
              </div>
            </div>
          )}

          {comparison.type === 'image' && (
            <div>
              <div style={{ background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
                <p style={{ fontSize: '18px', fontWeight: '600', color: '#374151' }}>
                  Similarity: {comparison.similarity}%
                </p>
                <p style={{ color: '#6b7280' }}>
                  Different pixels: {comparison.diffPixels.toLocaleString()}
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>{file1.name}</h3>
                  <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '8px' }}>
                    <canvas ref={canvasRef1} style={{ width: '100%' }} />
                  </div>
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>{file2.name}</h3>
                  <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '8px' }}>
                    <canvas ref={canvasRef2} style={{ width: '100%' }} />
                  </div>
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#dc2626' }}>Differences</h3>
                  <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '8px' }}>
                    <canvas ref={diffCanvasRef} style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    // Full screen container, removing padding here and adding it to the content wrapper
    <div style={{ minHeight: '100vh', width: '100%', background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)' }}>
      {/* Content wrapper with max width and padding */}
      <div style={{ maxWidth: '896px', margin: '0 auto', padding: '24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#1f2937', marginBottom: '8px' }}>Visual Document Comparator</h1>
          <p style={{ color: '#4b5563' }}>Upload two documents to see visual differences highlighted</p>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>Supports PDF, Word (.docx), and Images</p>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <p style={{ color: '#991b1b' }}>{error}</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText color="#2563eb" />
              Document 1
            </h3>
            
            {/* ➡️ INTEGRATED NEW DROPZONE COMPONENT */}
            <FileDropZone file={file1} setFile={setFile1} />
            
            {file1 && (
              <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', borderRadius: '8px' }}>
                <p style={{ fontSize: '14px', color: '#166534', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file1.name}</p>
              </div>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText color="#2563eb" />
              Document 2
            </h3>
            
            {/* ➡️ INTEGRATED NEW DROPZONE COMPONENT */}
            <FileDropZone file={file2} setFile={setFile2} />
            
            {file2 && (
              <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', borderRadius: '8px' }}>
                <p style={{ fontSize: '14px', color: '#166534', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file2.name}</p>
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleCompare}
            disabled={!file1 || !file2 || loading}
            style={{
              padding: '16px 32px',
              background: file1 && file2 && !loading ? '#2563eb' : '#d1d5db',
              color: 'white',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '18px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              border: 'none',
              cursor: file1 && file2 && !loading ? 'pointer' : 'not-allowed'
            }}
          >
            {loading ? 'Comparing...' : 'Compare Documents'}
          </button>
        </div>

        <div style={{ marginTop: '32px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px' }}>
          <h3 style={{ fontWeight: '600', color: '#374151', marginBottom: '12px' }}>How it works:</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li style={{ fontSize: '14px', color: '#4b5563', marginBottom: '8px' }}>• <strong>PDFs:</strong> Renders both documents and highlights removed text in red, added text in green</li>
            <li style={{ fontSize: '14px', color: '#4b5563', marginBottom: '8px' }}>• <strong>Word Documents:</strong> Displays formatted documents with color-coded differences</li>
            <li style={{ fontSize: '14px', color: '#4b5563' }}>• <strong>Images:</strong> Shows pixel-level differences with a visual diff overlay</li>
          </ul>
        </div>
      </div>

      <canvas ref={canvasRef1} style={{ display: 'none' }} />
      <canvas ref={canvasRef2} style={{ display: 'none' }} />
      <canvas ref={diffCanvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default VisualDocumentComparator;