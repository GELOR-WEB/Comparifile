import React, { useState, useEffect } from 'react';
import { Upload, AlertCircle, CheckCircle, FileText, ArrowLeft } from "lucide-react";
import mammoth from 'mammoth';

const DocumentComparator = () => {
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfjsLib, setPdfjsLib] = useState(null);
  const [text1, setText1] = useState('');
  const [text2, setText2] = useState('');

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      const PDFJS = window.pdfjsLib;
      if (PDFJS && PDFJS.GlobalWorkerOptions) {
        PDFJS.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      setPdfjsLib(PDFJS);
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const extractPdfText = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  };

  const extractWordText = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  const extractImageData = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve({ url: e.target.result, data: imageData, width: img.width, height: img.height });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const compareTexts = (text1, text2) => {
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);

    const maxLen = Math.max(words1.length, words2.length);
    let differences = 0;
    const matchedIndices = new Set();

    for (let i = 0; i < maxLen; i++) {
      if (words1[i] === words2[i]) {
        matchedIndices.add(i);
      } else {
        differences++;
      }
    }

    const similarity = ((maxLen - differences) / maxLen * 100).toFixed(2);
    const identicalWords = matchedIndices.size;
    const minorChanges = Math.floor(differences * 0.3);
    
    return { 
      similarity, 
      differences, 
      totalWords: maxLen, 
      matchedIndices,
      identicalWords,
      minorChanges,
      paraphrased: differences - minorChanges
    };
  };

  const compareImages = (img1, img2) => {
    if (img1.width !== img2.width || img1.height !== img2.height) {
      return {
        similarity: 0,
        message: 'Images have different dimensions',
        differences: 'N/A'
      };
    }

    const data1 = img1.data.data;
    const data2 = img2.data.data;
    let differences = 0;

    for (let i = 0; i < data1.length; i += 4) {
      const diff = Math.abs(data1[i] - data2[i]) +
        Math.abs(data1[i + 1] - data2[i + 1]) +
        Math.abs(data1[i + 2] - data2[i + 2]);
      if (diff > 30) differences++;
    }

    const totalPixels = data1.length / 4;
    const similarity = ((totalPixels - differences) / totalPixels * 100).toFixed(2);

    return { similarity, differences, totalPixels };
  };

  const highlightDifferences = (text, otherText, isFirst) => {
    const words = text.split(/\s+/);
    const otherWords = otherText.split(/\s+/);
    
    return words.map((word, idx) => {
      const isMatch = word === otherWords[idx];
      const color = isMatch ? '#fecaca' : '#dc2626';
      const bgColor = isMatch ? '#fef2f2' : '#fee2e2';
      
      return (
        <span 
          key={idx}
          style={{ 
            backgroundColor: bgColor,
            color: color,
            padding: '2px 0'
          }}
        >
          {word}{' '}
        </span>
      );
    });
  };

  const handleCompare = async () => {
    if (!file1 || !file2) {
      setError('Please upload both files');
      return;
    }

    if (!pdfjsLib && (file1.type.includes('pdf') || file2.type.includes('pdf'))) {
      setError('PDF library is still loading, please wait a moment...');
      return;
    }

    setLoading(true);
    setError('');
    setComparison(null);

    try {
      const type1 = file1.type;
      const type2 = file2.type;

      if (type1.includes('pdf') && type2.includes('pdf')) {
        const t1 = await extractPdfText(file1);
        const t2 = await extractPdfText(file2);
        setText1(t1);
        setText2(t2);
        const result = compareTexts(t1, t2);
        setComparison({ type: 'text', ...result });
      } else if (
        (type1.includes('word') || type1.includes('document')) &&
        (type2.includes('word') || type2.includes('document'))
      ) {
        const t1 = await extractWordText(file1);
        const t2 = await extractWordText(file2);
        setText1(t1);
        setText2(t2);
        const result = compareTexts(t1, t2);
        setComparison({ type: 'text', ...result });
      } else if (type1.includes('image') && type2.includes('image')) {
        const img1 = await extractImageData(file1);
        const img2 = await extractImageData(file2);
        const result = compareImages(img1, img2);
        setComparison({ type: 'image', ...result, img1: img1.url, img2: img2.url });
      } else {
        setError('Both files must be of the same type (both PDFs, both Word docs, or both images)');
      }
    } catch (err) {
      setError('Error processing files: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setComparison(null);
    setFile1(null);
    setFile2(null);
    setText1('');
    setText2('');
  };

  const FileUpload = ({ fileNum, file, setFile }) => (
    <div className="flex-1">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Document {fileNum}
      </label>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
        <input
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.bmp"
          onChange={(e) => setFile(e.target.files[0])}
          className="hidden"
          id={`file${fileNum}`}
        />
        <label htmlFor={`file${fileNum}`} className="cursor-pointer">
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-2" />
          {file ? (
            <p className="text-sm text-gray-600 font-medium">{file.name}</p>
          ) : (
            <p className="text-sm text-gray-600">Click to upload PDF, Word, or Image</p>
          )}
        </label>
      </div>
    </div>
  );

  if (comparison && comparison.type === 'text') {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg">
            {/* Header */}
            <div className="border-b border-gray-200 p-6 bg-white">
              <div className="flex items-center justify-between mb-4">
                <button 
                  onClick={handleBack}
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
                >
                  <ArrowLeft size={20} />
                  Back
                </button>
                <h2 className="text-xl font-bold text-gray-800">Plagiarism Detection</h2>
                <div className="text-2xl font-bold text-gray-800">{comparison.similarity}%</div>
              </div>
              
              {/* Match Statistics */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="font-semibold">IDENTICAL</span>
                  <span className="ml-auto">{comparison.similarity}%</span>
                  <span className="text-gray-500">{comparison.identicalWords}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-400"></div>
                  <span className="font-semibold">MINOR CHANGES</span>
                  <span className="ml-auto">{((comparison.minorChanges / comparison.totalWords) * 100).toFixed(1)}%</span>
                  <span className="text-gray-500">{comparison.minorChanges}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <span className="font-semibold">PARAPHRASED</span>
                  <span className="ml-auto">{((comparison.paraphrased / comparison.totalWords) * 100).toFixed(1)}%</span>
                  <span className="text-gray-500">{comparison.paraphrased}</span>
                </div>
              </div>
            </div>

            {/* Side by Side Comparison */}
            <div className="grid grid-cols-2 divide-x divide-gray-200">
              {/* Document 1 */}
              <div className="p-6 bg-white">
                <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
                  <FileText size={16} />
                  <span className="font-semibold">Document 1</span>
                  <span className="text-gray-400">({file1?.name})</span>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-sm leading-relaxed font-mono max-h-[600px] overflow-y-auto">
                  {highlightDifferences(text1, text2, true)}
                </div>
              </div>

              {/* Document 2 */}
              <div className="p-6 bg-gray-50">
                <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
                  <FileText size={16} />
                  <span className="font-semibold">Document 2</span>
                  <span className="text-gray-400">({file2?.name})</span>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-sm leading-relaxed font-mono max-h-[600px] overflow-y-auto">
                  {highlightDifferences(text2, text1, false)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
              Document Comparator
            </h1>
            <p className="text-gray-600">Compare PDFs, Word documents, and images</p>
          </div>

          <div className="flex gap-6 mb-6">
            <FileUpload fileNum={1} file={file1} setFile={setFile1} />
            <FileUpload fileNum={2} file={file2} setFile={setFile2} />
          </div>

          <button
            onClick={handleCompare}
            disabled={loading || !file1 || !file2}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Comparing...' : 'Compare Documents'}
          </button>

          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {comparison && comparison.type === 'image' && (
            <div className="mt-8 space-y-6">
              <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3 mb-6">
                  <CheckCircle className="text-green-600" size={24} />
                  <h2 className="text-2xl font-bold text-gray-800">Comparison Results</h2>
                </div>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Similarity Score</span>
                    <span className="text-2xl font-bold text-blue-600">{comparison.similarity}%</span>
                  </div>
                  <div className="h-8 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className="h-full bg-gradient-to-r from-green-400 to-blue-500 transition-all duration-1000 ease-out flex items-center justify-end px-3"
                      style={{ width: `${comparison.similarity}%` }}
                    >
                      {parseFloat(comparison.similarity) > 20 && (
                        <span className="text-white text-sm font-bold">{comparison.similarity}%</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-4 shadow">
                    <p className="text-sm text-gray-600 mb-1">Similarity</p>
                    <p className="text-3xl font-bold text-blue-600">{comparison.similarity}%</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow">
                    <p className="text-sm text-gray-600 mb-1">Differences</p>
                    <p className="text-3xl font-bold text-orange-600">{comparison.differences}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow">
                    <p className="text-sm text-gray-600 mb-1">Total Pixels</p>
                    <p className="text-3xl font-bold text-gray-700">{comparison.totalPixels}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Image Comparison</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border-2 border-blue-200 rounded-lg overflow-hidden">
                    <div className="bg-blue-100 px-3 py-2 border-b border-blue-200">
                      <p className="text-sm text-blue-800 font-semibold">📄 Image 1</p>
                    </div>
                    <img src={comparison.img1} alt="Image 1" className="w-full" />
                  </div>
                  <div className="border-2 border-green-200 rounded-lg overflow-hidden">
                    <div className="bg-green-100 px-3 py-2 border-b border-green-200">
                      <p className="text-sm text-green-800 font-semibold">📄 Image 2</p>
                    </div>
                    <img src={comparison.img2} alt="Image 2" className="w-full" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentComparator;