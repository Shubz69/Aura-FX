// Voice Input Component
// Speech-to-text and text-to-speech for AI conversations

import React, { useState, useEffect, useRef } from 'react';
import '../styles/VoiceInput.css';

const VoiceInput = ({ onTranscript, onStart, onStop, disabled = false }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Check if browser supports Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setIsSupported(true);
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        if (onTranscript) {
          onTranscript(finalTranscript || interimTranscript, !finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech' || event.error === 'audio-capture') {
          // These are common and can be ignored
          return;
        }
        setIsListening(false);
        if (onStop) onStop();
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        if (onStop) onStop();
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [onTranscript, onStart, onStop]);

  const startListening = () => {
    if (!isSupported || disabled) return;
    
    try {
      recognitionRef.current.start();
      setIsListening(true);
      if (onStart) onStart();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      if (onStop) onStop();
    }
  };

  if (!isSupported) {
    return null; // Don't show button if not supported
  }

  return (
    <button
      type="button"
      className={`voice-input-btn ${isListening ? 'listening' : ''}`}
      onClick={isListening ? stopListening : startListening}
      disabled={disabled}
      title={isListening ? 'Stop recording' : 'Start voice input'}
    >
      {isListening ? '🎤' : '🎙️'}
    </button>
  );
};

// Text-to-Speech component
export const VoiceOutput = ({ text, autoPlay = false, disabled = false }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef(null);

  useEffect(() => {
    if (autoPlay && text && !disabled) {
      speak(text);
    }
  }, [text, autoPlay, disabled]);

  const speak = (textToSpeak) => {
    if (!textToSpeak || disabled) return;
    
    // Cancel any ongoing speech
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  return (
    <div className="voice-output">
      <button
        type="button"
        className={`voice-output-btn ${isSpeaking ? 'speaking' : ''}`}
        onClick={() => isSpeaking ? stop() : speak(text)}
        disabled={disabled || !text}
        title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
      >
        {isSpeaking ? '🔇' : '🔊'}
      </button>
    </div>
  );
};

export default VoiceInput;
