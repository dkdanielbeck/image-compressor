import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { compressImage, type CodecConfig, type CompressedPayload } from './services/compression';
import { archiveImages } from './services/archival';
import './index.css';

const DEFAULT_CONFIG: CodecConfig = {
  avif: { quality: 96, speed: 6, subsample: 2, denoiseLevel: 2, sharpness: 1 },
  webp: { quality: 96, method: 6, lossless: false },
  jpeg: { quality: 96, trellisMultipass: true },
};

export default function App() {
  const [config] = useState<CodecConfig>(DEFAULT_CONFIG);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<CompressedPayload[]>([]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setIsProcessing(true);
    setProgress(`0 / ${acceptedFiles.length}`);
    setResults([]);

    try {
      const payloads: CompressedPayload[] = [];
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        const result = await compressImage(file, config);
        payloads.push(result);
        setProgress(`${i + 1} / ${acceptedFiles.length}`);
      }

      setProgress('Structuring ZIP archive...');
      await archiveImages(payloads);

      setResults(payloads);
    } catch (err) {
      console.error(err);
      alert('An error occurred during compression.');
    } finally {
      setIsProcessing(false);
      setProgress('');
    }
  }, [config]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': []
    }
  });

  return (
    <div className="app-container">
      <header className="header">
        <h1>WASM Compressor</h1>
        <p>Zero-config, client-side bulk image optimization</p>
      </header>

      {isProcessing ? (
        <div className="processing-state">
          <div className="loader"></div>
          <h2>Processing Assets</h2>
          <p className="progress-text">{progress}</p>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'active' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="dropzone-content">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            {isDragActive ? (
              <p>Drop the files here ...</p>
            ) : (
              <p>Drag 'n' drop images here, or click to select files</p>
            )}
          </div>
        </div>
      )}

      {results.length > 0 && !isProcessing && (
        <div className="results-container">
          <h3>Compression Results</h3>
          <ul className="results-list">
            {results.map((res) => (
              <li key={res.filename} className="result-item">
                <div className="result-line">
                  <strong>{res.filename}.avif</strong>
                  <span className="kb-size">{(res.sizes.avif / 1024).toFixed(1)} KB</span>
                </div>
                <div className="result-line">
                  <strong>{res.filename}.webp</strong>
                  <span className="kb-size">{(res.sizes.webp / 1024).toFixed(1)} KB</span>
                </div>
                <div className="result-line">
                  <strong>{res.filename}.jpg</strong>
                  <span className="kb-size">{(res.sizes.jpg / 1024).toFixed(1)} KB</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
