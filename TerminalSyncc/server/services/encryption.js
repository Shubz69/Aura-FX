import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-gcm';
// Read from EncryptionKey (with potential leading spaces) or ENCRYPTION_KEY
const SECRET_KEY = (process.env.EncryptionKey || process.env.ENCRYPTION_KEY || '').trim();

export const encrypt = (text) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY, 'hex'), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag().toString('hex');
    
    return {
        content: encrypted,
        iv: iv.toString('hex'),
        tag: tag
    };
};

export const decrypt = (enc) => {
    const decipher = crypto.createDecipheriv(
        ALGORITHM, 
        Buffer.from(SECRET_KEY, 'hex'), 
        Buffer.from(enc.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(enc.tag, 'hex'));
    
    let decrypted = decipher.update(enc.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
};