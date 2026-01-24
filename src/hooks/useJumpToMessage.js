import { useCallback, useRef } from 'react';
import { toast } from 'react-toastify';

/**
 * Custom hook for jump-to-message functionality
 * 
 * Implements the locate API flow:
 * 1. Check if message already in loaded list
 * 2. If not, call locate API to get anchor cursor
 * 3. Fetch page containing message
 * 4. Scroll into view with highlight animation
 * 5. Set focus for accessibility
 * 
 * Fallback: iterative backfill (max 10 fetches)
 */

const MAX_BACKFILL_ATTEMPTS = 10;

export function useJumpToMessage({
  channelId,
  messages = [],
  fetchMessages,
  loadMoreMessages
}) {
  const highlightTimeoutRef = useRef(null);
  const token = localStorage.getItem('token');
  const baseUrl = window.location.origin;

  /**
   * Locate message via API
   */
  const locateMessage = useCallback(async (messageId) => {
    if (!token || !channelId) return null;
    
    try {
      const response = await fetch(
        `${baseUrl}/api/messages/locate?channelId=${channelId}&messageId=${messageId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        return data;
      }
      
      if (response.status === 404) {
        return { notFound: true };
      }
      
      return null;
    } catch (error) {
      console.error('Failed to locate message:', error);
      return null;
    }
  }, [token, baseUrl, channelId]);

  /**
   * Scroll message into view with highlight effect
   */
  const scrollToMessage = useCallback((messageId, focus = true) => {
    const element = document.querySelector(`[data-message-id="${messageId}"]`);
    
    if (!element) return false;
    
    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Add highlight class
    element.classList.add('message-highlight-pulse');
    
    // Clear previous timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    
    // Remove highlight after 3 seconds
    highlightTimeoutRef.current = setTimeout(() => {
      element.classList.remove('message-highlight-pulse');
    }, 3000);
    
    // Set focus for accessibility
    if (focus) {
      element.setAttribute('tabindex', '-1');
      element.focus({ preventScroll: true });
    }
    
    return true;
  }, []);

  /**
   * Check if message is in current list
   */
  const isMessageInList = useCallback((messageId) => {
    return messages.some(m => m.id === parseInt(messageId) || m.id === messageId);
  }, [messages]);

  /**
   * Backfill messages until target is found
   */
  const backfillUntilFound = useCallback(async (messageId, attempts = 0) => {
    if (attempts >= MAX_BACKFILL_ATTEMPTS) {
      return false;
    }
    
    // Check if already loaded
    if (isMessageInList(messageId)) {
      return true;
    }
    
    // Try to load more
    if (loadMoreMessages) {
      const loaded = await loadMoreMessages();
      if (!loaded || loaded.length === 0) {
        // No more messages to load
        return false;
      }
      
      // Check again
      if (isMessageInList(messageId)) {
        return true;
      }
      
      // Recursively try again
      return backfillUntilFound(messageId, attempts + 1);
    }
    
    return false;
  }, [isMessageInList, loadMoreMessages]);

  /**
   * Main jump-to-message function
   */
  const jumpToMessage = useCallback(async (messageId, options = {}) => {
    const { focus = true, clearUrlParam = true } = options;
    
    if (!messageId) return false;
    
    const numericId = parseInt(messageId);
    
    // Step 1: Check if message already loaded
    if (isMessageInList(numericId)) {
      // Wait for DOM to update
      await new Promise(r => setTimeout(r, 100));
      const scrolled = scrollToMessage(numericId, focus);
      
      if (scrolled && clearUrlParam) {
        // Clear jump param from URL
        const url = new URL(window.location.href);
        url.searchParams.delete('jump');
        url.searchParams.delete('focus');
        window.history.replaceState({}, '', url.toString());
      }
      
      return scrolled;
    }
    
    // Step 2: Try locate API
    const locateResult = await locateMessage(numericId);
    
    if (locateResult?.notFound) {
      toast.error('Message no longer available');
      
      if (clearUrlParam) {
        const url = new URL(window.location.href);
        url.searchParams.delete('jump');
        url.searchParams.delete('focus');
        window.history.replaceState({}, '', url.toString());
      }
      
      return false;
    }
    
    if (locateResult?.anchorCursor && fetchMessages) {
      // Fetch messages around the anchor
      try {
        await fetchMessages({ around: locateResult.anchorCursor, messageId: numericId });
        
        // Wait for DOM to update
        await new Promise(r => setTimeout(r, 200));
        
        if (isMessageInList(numericId)) {
          const scrolled = scrollToMessage(numericId, focus);
          
          if (scrolled && clearUrlParam) {
            const url = new URL(window.location.href);
            url.searchParams.delete('jump');
            url.searchParams.delete('focus');
            window.history.replaceState({}, '', url.toString());
          }
          
          return scrolled;
        }
      } catch (error) {
        console.error('Failed to fetch messages around anchor:', error);
      }
    }
    
    // Step 3: Fallback - iterative backfill
    const found = await backfillUntilFound(numericId);
    
    if (found) {
      await new Promise(r => setTimeout(r, 100));
      const scrolled = scrollToMessage(numericId, focus);
      
      if (scrolled && clearUrlParam) {
        const url = new URL(window.location.href);
        url.searchParams.delete('jump');
        url.searchParams.delete('focus');
        window.history.replaceState({}, '', url.toString());
      }
      
      return scrolled;
    }
    
    // Message not found after all attempts
    toast.error('Message no longer available');
    
    if (clearUrlParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete('jump');
      url.searchParams.delete('focus');
      window.history.replaceState({}, '', url.toString());
    }
    
    return false;
  }, [
    isMessageInList, 
    scrollToMessage, 
    locateMessage, 
    fetchMessages, 
    backfillUntilFound
  ]);

  return {
    jumpToMessage,
    scrollToMessage,
    isMessageInList,
    locateMessage
  };
}

export default useJumpToMessage;
