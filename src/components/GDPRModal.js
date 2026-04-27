import React from "react";
import { useTranslation } from "react-i18next";
import "../styles/GDPRModal.css";

const GDPRModal = ({ onAgree }) => {
    const { t } = useTranslation();
    return (
        <div className="gdpr-backdrop">
            <div className="gdpr-modal">
                <h2>{t('gdpr.title')}</h2>
                <p>{t('gdpr.body1')}</p>
                <p>{t('gdpr.body2')}</p>
                <button onClick={onAgree}>{t('gdpr.agree')}</button>
            </div>
        </div>
    );
};

export default GDPRModal;
