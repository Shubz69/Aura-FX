import React, { useEffect, useRef } from 'react';
import { FaTimes, FaDownload, FaExternalLinkAlt } from 'react-icons/fa';
import './ImageModal.css';

const ImageModal = ({ isOpen, onClose, imageUrl, fileName, fileType }) => {
    const modalRef = useRef(null);
    
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        
        const handleClickOutside = (e) => {
            if (modalRef.current && !modalRef.current.contains(e.target)) {
                onClose();
            }
        };
        
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.addEventListener('mousedown', handleClickOutside);
            document.body.style.overflow = 'hidden';
        }
        
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('mousedown', handleClickOutside);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);
    
    if (!isOpen) return null;
    
    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = fileName || 'image';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handleOpenNewTab = () => {
        window.open(imageUrl, '_blank', 'noopener,noreferrer');
    };
    
    const isImage = fileType?.startsWith('image/') || 
                    fileName?.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i);
    
    return (
        <div className="image-modal-overlay">
            <div className="image-modal-content" ref={modalRef}>
                <div className="image-modal-header">
                    <h3 className="image-modal-title">
                        {fileName || 'Image Preview'}
                    </h3>
                    <div className="image-modal-actions">
                        <button 
                            className="image-modal-action-btn"
                            onClick={handleDownload}
                            title="Download"
                        >
                            <FaDownload />
                        </button>
                        <button 
                            className="image-modal-action-btn"
                            onClick={handleOpenNewTab}
                            title="Open in new tab"
                        >
                            <FaExternalLinkAlt />
                        </button>
                        <button 
                            className="image-modal-close-btn"
                            onClick={onClose}
                            title="Close"
                        >
                            <FaTimes />
                        </button>
                    </div>
                </div>
                
                <div className="image-modal-body">
                    {isImage ? (
                        <img 
                            src={imageUrl} 
                            alt={fileName || 'Preview'} 
                            className="image-modal-img"
                            loading="lazy"
                        />
                    ) : (
                        <div className="image-modal-file-placeholder">
                            <div className="file-icon-large">📄</div>
                            <p className="file-name-large">{fileName}</p>
                            <p className="file-type-info">
                                This file type cannot be previewed
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImageModal;