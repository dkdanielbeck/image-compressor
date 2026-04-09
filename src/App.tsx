import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { compressImage, type CodecConfig, type CompressedPayload } from './services/compression';
import { archiveImages } from './services/archival';
import './index.css';

const DEFAULT_CONFIG: CodecConfig = {
  avif: { quality: 96, speed: 6, subsample: 2, denoiseLevel: 0, sharpness: 1, minQuality: 50, targetSsim: 0.985 },
  webp: { quality: 96, method: 6, lossless: false, minQuality: 75, targetSsim: 0.990 },
  jpeg: { quality: 96, trellisMultipass: true, minQuality: 75, targetSsim: 0.990 },
};

export default function App() {
  const [config, setConfig] = useState<CodecConfig>(() => {
    const saved = localStorage.getItem('compressorAdvancedConfig');
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });
  const [mode, setMode] = useState<'fast' | 'advanced'>(() => {
    return (localStorage.getItem('compressorMode') as 'fast' | 'advanced') || 'fast';
  });
  const [targetKb, setTargetKb] = useState<number>(() => {
    const saved = localStorage.getItem('compressorTargetKb');
    return saved ? parseInt(saved, 10) : 350;
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<CompressedPayload[]>([]);

  useEffect(() => {
    localStorage.setItem('compressorAdvancedConfig', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('compressorMode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('compressorTargetKb', targetKb.toString());
  }, [targetKb]);

  const handleReset = () => {
    if (window.confirm('Reset advanced constraints to default values?')) {
      setConfig(DEFAULT_CONFIG);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setIsProcessing(true);
    setProgress(`0 / ${acceptedFiles.length}`);
    setResults([]);

    // Force React to paint the "Processing..." UI before heavy Canvas/WASM blocks main thread
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const payloads: CompressedPayload[] = [];
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        const result = await compressImage(file, config, mode, targetKb * 1024);
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
  }, [config, mode, targetKb]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': []
    }
  });

  return (
    <div className="app-container">
      <header className="header">
        <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="WASM Compressor Logo" className="app-logo" />
        <h1>WASM Compressor</h1>
        <p>Zero-config, client-side bulk image optimization</p>
      </header>

      <div className="mode-toggle">
        <button 
          className={`mode-btn custom-tooltip ${mode === 'fast' ? 'active' : ''}`}
          onClick={() => setMode('fast')}
          data-tooltip="Fast Mode: Compresses images as quickly as possible to hit your target file size. Perfect for general web use."
        >Fast Mode</button>
        <button 
          className={`mode-btn custom-tooltip ${mode === 'advanced' ? 'active' : ''}`}
          onClick={() => setMode('advanced')}
          data-tooltip="Advanced Mode: Total control over the compression. Fine-tune exactly how the images look using minimum quality limits and AI visual scoring."
        >Advanced Mode</button>
      </div>

      {mode === 'fast' ? (
        <div className="fast-setup">
          <label className="target-size-label">
            <span className="custom-tooltip" data-tooltip="The app will automatically find the highest possible quality that still stays under this exact file size.">Target Max Filesize (KB):</span>
            <input 
              type="number" 
              min="10" 
              max="10000" 
              value={targetKb} 
              onChange={e => setTargetKb(parseInt(e.target.value) || 350)} 
            />
          </label>
        </div>
      ) : (
        <details className="settings-panel" open>
          <summary>
            <span>⚙️ Advanced Constraints</span>
            <button className="reset-btn" onClick={(e) => { e.preventDefault(); handleReset(); }}>Reset Defaults</button>
          </summary>
          <div className="settings-grid">
            <div className="settings-group">
              <h3>AVIF</h3>
              <label>
                <span className="custom-tooltip" data-tooltip="The absolute lowest quality you'll accept. A higher number ensures the image won't look too pixelated, even if it makes the file bigger.">Min Quality: <strong>{config.avif.minQuality}</strong></span>
                <input type="range" min="10" max="96" value={config.avif.minQuality} onChange={e => setConfig({ ...config, avif: { ...config.avif, minQuality: parseInt(e.target.value) } })} />
              </label>
              <label>
                <span className="custom-tooltip" data-tooltip="Target Visual Score. A score of 0.99 means the compressed image should look 99% identical to the original picture.">Target SSIM:</span>
                <input type="number" step="0.001" min="0.800" max="1.000" value={config.avif.targetSsim} onChange={e => setConfig({ ...config, avif: { ...config.avif, targetSsim: parseFloat(e.target.value) } })} />
              </label>
            </div>
            <div className="settings-group">
              <h3>WebP</h3>
              <label>
                <span className="custom-tooltip" data-tooltip="The absolute lowest quality you'll accept. A higher number ensures the image won't look too pixelated, even if it makes the file bigger.">Min Quality: <strong>{config.webp.minQuality}</strong></span>
                <input type="range" min="10" max="96" value={config.webp.minQuality} onChange={e => setConfig({ ...config, webp: { ...config.webp, minQuality: parseInt(e.target.value) } })} />
              </label>
              <label>
                <span className="custom-tooltip" data-tooltip="Target Visual Score. A score of 0.99 means the compressed image should look 99% identical to the original picture.">Target SSIM:</span>
                <input type="number" step="0.001" min="0.800" max="1.000" value={config.webp.targetSsim} onChange={e => setConfig({ ...config, webp: { ...config.webp, targetSsim: parseFloat(e.target.value) } })} />
              </label>
            </div>
            <div className="settings-group">
              <h3>JPEG</h3>
              <label>
                <span className="custom-tooltip" data-tooltip="The absolute lowest quality you'll accept. A higher number ensures the image won't look too pixelated, even if it makes the file bigger.">Min Quality: <strong>{config.jpeg.minQuality}</strong></span>
                <input type="range" min="10" max="96" value={config.jpeg.minQuality} onChange={e => setConfig({ ...config, jpeg: { ...config.jpeg, minQuality: parseInt(e.target.value) } })} />
              </label>
              <label>
                <span className="custom-tooltip" data-tooltip="Target Visual Score. A score of 0.99 means the compressed image should look 99% identical to the original picture.">Target SSIM:</span>
                <input type="number" step="0.001" min="0.800" max="1.000" value={config.jpeg.targetSsim} onChange={e => setConfig({ ...config, jpeg: { ...config.jpeg, targetSsim: parseFloat(e.target.value) } })} />
              </label>
            </div>
          </div>
        </details>
      )}

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
              <h2 className="drop-title active-title">Drop the files here ...</h2>
            ) : (
              <div className="droptext">
                <h2 className="drop-title">Drop images to compress</h2>
                <p className="drop-desc">
                  Auto-optimizes images into AVIF, WebP, and JPEG 
                  {mode === 'fast' ? ` attempting to strictly stay under ${targetKb}KB.` : ' balancing filesize limits with high visual fidelity via SSIM.'}
                </p>
                <div className="btn-wrapper">
                  <button className="select-btn">Select Local Files</button>
                </div>
              </div>
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
