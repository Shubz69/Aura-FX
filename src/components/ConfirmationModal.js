import React from 'react';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import '../styles/ConfirmationModal.css';

const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger' // 'danger', 'warning', 'info'
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="confirmation-modal-overlay" onClick={handleBackdropClick}>
      <div className="confirmation-modal">
        <button 
          className="confirmation-modal-close" 
          onClick={onClose}
          aria-label="Close"
        >
          <FaTimes />
        </button>
        
        <div className={`confirmation-modal-icon ${type}`}>
          <FaExclamationTriangle />
        </div>
        
        <h2 className="confirmation-modal-title">{title}</h2>
        
        <p className="confirmation-modal-message">{message}</p>
        
        <div className="confirmation-modal-actions">
          <button 
            className="confirmation-modal-btn confirmation-modal-btn-cancel"
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button 
            className={`confirmation-modal-btn confirmation-modal-btn-confirm ${type}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;

