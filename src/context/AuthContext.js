import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Api from '../services/Api';
import { jwtDecode } from 'jwt-decode';

// Create the context
const AuthContext = createContext(null);

// Custom hook for using the auth context
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const navigate = useNavigate();

  const clearSession = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('mfaVerified');
    localStorage.removeItem('mfaEmail');
    localStorage.removeItem('user');
    localStorage.removeItem('hasActiveSubscription');
    localStorage.removeItem('pendingSubscription');
    localStorage.removeItem('subscriptionSkipped');
    setToken(null);
  }, []);

  const persistTokens = useCallback((nextToken, refreshToken) => {
    if (nextToken) {
      localStorage.setItem('token', nextToken);
      setToken(nextToken);
    } else {
      localStorage.removeItem('token');
      setToken(null);
    }

    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
  }, []);

  const resolveUserInfo = (data = {}) => {
    const email = (data.email || '').toLowerCase();
    const role = data.role || 'free';
    
    // Check if user is super admin by email
    let finalRole = role;
    if (email === 'shubzfx@gmail.com') {
      finalRole = 'super_admin';
    }
    
    return {
      id: data.id || data.userId || data.sub || null,
      username: data.username || data.name || '',
      email: data.email || '',
      name: data.name || data.username || '',
      avatar: data.avatar || '/avatars/avatar_ai.png',
      phone: data.phone || '',
      address: data.address || '',
      role: finalRole,
      capabilities: data.capabilities || [],
      mfaVerified: data.mfaVerified || false
    };
  };

  const persistUser = useCallback((userInfo) => {
    const safeUser = resolveUserInfo(userInfo);
    localStorage.setItem('user', JSON.stringify(safeUser));
    setUser(safeUser);
    return safeUser;
  }, []);

  // Check if user has a verified session in localStorage
  useEffect(() => {
    const mfaVerifiedStatus = localStorage.getItem('mfaVerified');
    if (mfaVerifiedStatus === 'true') {
      setMfaVerified(true);
    }
  }, []);

  // Logout function defined using useCallback
  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setMfaVerified(false);
    navigate('/login');
  }, [clearSession, navigate]);

  // Check if token exists and is valid on app load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
        if (!token) {
          setUser(null);
          setLoading(false);
          return;
        }
        
        // Check if token is expired
        try {
          const decodedToken = jwtDecode(token);
          const currentTime = Date.now() / 1000;
          
          if (decodedToken.exp < currentTime) {
            logout();
            setLoading(false);
            return;
          }
          
          // Verify user still exists in database (account might have been deleted)
          // Do this asynchronously and non-blocking to avoid blocking app load
          const userId = decodedToken.id || decodedToken.userId || decodedToken.sub;
          if (userId) {
            // Run verification in background - don't block app loading
            setTimeout(async () => {
              try {
                const API_BASE_URL = process.env.REACT_APP_API_URL || window.location.origin;
                const verifyResponse = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  signal: AbortSignal.timeout(5000) // 5 second timeout
                });
                
                // Only logout on 404 (user not found), not on 500 (server error)
                if (verifyResponse.status === 404) {
                  // User doesn't exist - account was deleted
                  console.warn('User account not found - logging out');
                  logout();
                } else if (verifyResponse.status === 500) {
                  // Server error - don't logout, just log warning
                  console.warn('Server error verifying user - keeping session active');
                } else if (!verifyResponse.ok) {
                  // Other errors - log but don't logout
                  console.warn('Error verifying user:', verifyResponse.status);
                }
              } catch (verifyError) {
                // If verification fails, don't block - just log warning
                // Network errors or timeouts shouldn't prevent app from loading
                // Suppress timeout errors as they're expected and non-critical
                const isTimeoutError = verifyError.name === 'AbortError' || 
                                      verifyError.name === 'TimeoutError' ||
                                      verifyError.message?.toLowerCase().includes('timeout') ||
                                      verifyError.message?.toLowerCase().includes('timed out');
                
                if (!isTimeoutError) {
                  console.warn('Could not verify user existence:', verifyError);
                }
                // Timeout errors are silently ignored - they're expected on slow connections
              }
            }, 100); // Small delay to let app load first
          }
          
          // Token is valid, get minimal user info from token
          // No API call for now to avoid errors
          // userId already declared above, reuse it
          const userData = persistUser({
            id: userId,
            email: decodedToken.email || '',
            role: decodedToken.role || 'USER'
          });
          
          if (userData.role === 'ADMIN') {
            localStorage.setItem('mfaVerified', 'true');
            setMfaVerified(true);
          }
          
          // Check daily login streak (non-blocking, runs in background)
          // This runs every time the app loads to check if user logged in today
          // IMPORTANT: Only check once per day to prevent duplicate XP awards
          if (userId) {
            // Check if we already checked today (prevent duplicate calls)
            const lastCheckKey = `daily_login_check_${userId}`;
            const lastCheckDate = localStorage.getItem(lastCheckKey);
            const today = new Date().toDateString();
            
            // Also check if there's an in-progress call to prevent race conditions
            const inProgressKey = `daily_login_in_progress_${userId}`;
            const isInProgress = localStorage.getItem(inProgressKey) === 'true';
            
            // Only check if we haven't checked today AND no call is in progress
            if (lastCheckDate !== today && !isInProgress) {
              // Mark that we're checking NOW (before API call) to prevent race conditions
              localStorage.setItem(lastCheckKey, today);
              localStorage.setItem(inProgressKey, 'true');
              
              setTimeout(async () => {
                try {
                  const loginResponse = await Api.checkDailyLogin(userId);
                  
                  // Clear in-progress flag
                  localStorage.removeItem(inProgressKey);
                  
                  if (loginResponse.data && loginResponse.data.success) {
                    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
                    
                    // CRITICAL: Check alreadyLoggedIn FIRST - if true, NEVER update XP/level
                    // This is the most important check to prevent duplicate XP awards
                    if (loginResponse.data.alreadyLoggedIn === true) {
                      // Already logged in today - DO NOT update XP/level, only update streak display
                      const updatedUser = {
                        ...currentUser,
                        login_streak: loginResponse.data.streak || currentUser.login_streak || 0
                        // DO NOT update xp or level - keep existing values
                      };
                      persistUser(updatedUser);
                    } else if (loginResponse.data.xpAwarded && 
                        loginResponse.data.xpAwarded > 0 && 
                        loginResponse.data.alreadyLoggedIn !== true) {
                      // XP was awarded - update user data
                      const updatedUser = {
                        ...currentUser,
                        xp: loginResponse.data.newXP,
                        level: loginResponse.data.newLevel,
                        login_streak: loginResponse.data.streak || 0
                      };
                      persistUser(updatedUser);
                      console.log(`🔥 Daily login: ${loginResponse.data.streak} day streak! +${loginResponse.data.xpAwarded} XP`);
                    } else {
                      // No XP awarded but success - just update streak
                      const updatedUser = {
                        ...currentUser,
                        login_streak: loginResponse.data.streak || currentUser.login_streak || 0
                      };
                      persistUser(updatedUser);
                    }
                  }
                } catch (error) {
                  // Clear in-progress flag on error
                  localStorage.removeItem(inProgressKey);
                  
                  // On error, remove the check flag so we can retry (but only after 1 hour)
                  // This prevents infinite retries but allows recovery from temporary errors
                  const errorRetryKey = `daily_login_error_${userId}`;
                  const lastErrorTime = localStorage.getItem(errorRetryKey);
                  const now = Date.now();
                  
                  if (!lastErrorTime || (now - parseInt(lastErrorTime)) > 3600000) { // 1 hour
                    localStorage.removeItem(lastCheckKey); // Allow retry after 1 hour
                    localStorage.setItem(errorRetryKey, now.toString());
                  }
                  
                  // Silently fail - don't block app loading
                  // Only log if it's not a timeout (to reduce console noise)
                  if (!error.message || (!error.message.includes('timeout') && !error.message.includes('Timeout') && !error.message.includes('504'))) {
                    console.error('Daily login check failed:', error);
                  }
                }
              }, 500); // Small delay to let app load first
            } else if (isInProgress) {
              // Another call is in progress, wait a bit and check again
              setTimeout(() => {
                const stillInProgress = localStorage.getItem(inProgressKey) === 'true';
                if (stillInProgress) {
                  // If still in progress after 5 seconds, clear it (stuck call)
                  localStorage.removeItem(inProgressKey);
                }
              }, 5000);
            }
          }
          
          setLoading(false);
        } catch (tokenError) {
          console.error('Token decode error:', tokenError);
          logout();
          setLoading(false);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setError(error.message || 'Authentication failed');
        logout();
        setLoading(false);
      }
    };
    
    checkAuth();
  }, [logout, persistUser]);

  // Login function - supports both email/password login and token-based login from MFA
  const login = async (emailOrToken, passwordOrRole, userData = null) => {
    try {
      setLoading(true);
      setError(null);
      
      // Check which login method is being used
      if (userData) {
        const token = emailOrToken;
        const role = passwordOrRole;

        persistTokens(token, localStorage.getItem('refreshToken'));
        localStorage.setItem('mfaVerified', 'true');
        setMfaVerified(true);
        return persistUser({ ...userData, role });
      } else {
        // This is an email/password login
        const email = emailOrToken;
        const password = passwordOrRole;
        
        // Call the login API
        const response = await Api.login({ email, password });
        const data = response.data || {};
        
        // Check if login was successful - must have a token and success flag
        if (!data.token || data.success === false) {
          // If we have an error message, use it
          if (data.message) {
            throw new Error(data.message);
          }
          throw new Error('Login failed: No token received from server');
        }
        
        if (data.status === "MFA_REQUIRED" && !data.mfaVerified) {
          // Redirect to MFA verification
          localStorage.setItem('mfaEmail', email);
          
          // Navigate programmatically to the MFA verification page
          // with proper state data that won't be lost in browser history
          navigate('/verify-mfa', {
            state: {
              userId: data.id,
              email: email,
              requiresVerification: true,
              userData: data,
              returnUrl: '/community'
            },
            replace: true  // Replace the history entry so back button works properly
          });
          
          // Return early to prevent further processing
          setLoading(false);
          return data;
        }
        
        // Only proceed if we have a valid token
        if (!data.token) {
          throw new Error('Login failed: Invalid response from server');
        }
        
        persistTokens(data.token, data.refreshToken);
        persistUser(data);
        
        if (data.role === 'ADMIN') {
          localStorage.setItem('mfaVerified', 'true');
          setMfaVerified(true);
        }
        
        // Check and award daily login streak XP (non-blocking)
        // IMPORTANT: Only award XP once per day, not on every login
        if (data.id || data.userId) {
          const userId = data.id || data.userId;
          const lastCheckKey = `daily_login_check_${userId}`;
          const lastCheckDate = localStorage.getItem(lastCheckKey);
          const today = new Date().toDateString();
          const inProgressKey = `daily_login_in_progress_${userId}`;
          const isInProgress = localStorage.getItem(inProgressKey) === 'true';
          
          // Only check if we haven't checked today AND no call is in progress
          if (lastCheckDate !== today && !isInProgress) {
            // Set flag BEFORE API call to prevent race conditions
            localStorage.setItem(lastCheckKey, today);
            localStorage.setItem(inProgressKey, 'true');
            
            Api.checkDailyLogin(userId)
              .then((loginResponse) => {
                // Clear in-progress flag
                localStorage.removeItem(inProgressKey);
                
                if (loginResponse.data && loginResponse.data.success) {
                  // CRITICAL: Check alreadyLoggedIn FIRST - if true, NEVER update XP/level
                  if (loginResponse.data.alreadyLoggedIn === true) {
                    // Already logged in today - DO NOT update XP/level, only update streak
                    const updatedUser = {
                      ...data,
                      login_streak: loginResponse.data.streak || data.login_streak || 0
                      // DO NOT update xp or level
                    };
                    persistUser(updatedUser);
                  } else if (loginResponse.data.xpAwarded && 
                      loginResponse.data.xpAwarded > 0 && 
                      loginResponse.data.alreadyLoggedIn !== true) {
                    // XP was awarded - update user data
                    const updatedUser = {
                      ...data,
                      xp: loginResponse.data.newXP,
                      level: loginResponse.data.newLevel,
                      login_streak: loginResponse.data.streak || 0
                    };
                    persistUser(updatedUser);
                    console.log(`🔥 Daily login: ${loginResponse.data.streak} day streak! +${loginResponse.data.xpAwarded} XP`);
                  } else {
                    // No XP awarded - just update streak
                    const updatedUser = {
                      ...data,
                      login_streak: loginResponse.data.streak || data.login_streak || 0
                    };
                    persistUser(updatedUser);
                  }
                }
              })
              .catch((error) => {
                // Clear in-progress flag on error
                localStorage.removeItem(inProgressKey);
                
                // On error, remove check flag to allow retry (but only after delay)
                const errorRetryKey = `daily_login_error_${userId}`;
                const lastErrorTime = localStorage.getItem(errorRetryKey);
                const now = Date.now();
                
                if (!lastErrorTime || (now - parseInt(lastErrorTime)) > 3600000) { // 1 hour
                  localStorage.removeItem(lastCheckKey);
                  localStorage.setItem(errorRetryKey, now.toString());
                }
                
                // Don't block login if daily login check fails
                if (!error.message || (!error.message.includes('timeout') && !error.message.includes('Timeout') && !error.message.includes('504'))) {
                  console.error('Error checking daily login:', error);
                }
              });
          }
        }
        
        // ============= SERVER-AUTHORITATIVE SUBSCRIPTION CHECK =============
        // CRITICAL: Always fetch subscription status from server after login
        // This is the SINGLE SOURCE OF TRUTH for determining redirect
        // DO NOT use localStorage for access decisions - only server response
        
        let hasCommunityAccess = false;
        let accessType = 'NONE';
        
        try {
          const API_BASE_URL = process.env.REACT_APP_API_URL || window.location.origin;
          const subscriptionResponse = await fetch(`${API_BASE_URL}/api/subscription/status`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${data.token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (subscriptionResponse.ok) {
            const subscriptionData = await subscriptionResponse.json();
            if (subscriptionData.success && subscriptionData.subscription) {
              // Use the server-authoritative hasCommunityAccess flag
              hasCommunityAccess = subscriptionData.subscription.hasCommunityAccess === true;
              accessType = subscriptionData.subscription.accessType || 'NONE';
              
              // Store for reference (NOT for access decisions - only server is authoritative)
              if (hasCommunityAccess) {
                localStorage.setItem('hasActiveSubscription', 'true');
                localStorage.setItem('accessType', accessType);
              } else {
                localStorage.removeItem('hasActiveSubscription');
                localStorage.removeItem('accessType');
              }
            }
          } else {
            console.error('Subscription status fetch failed:', subscriptionResponse.status);
            // On fetch failure, check role as fallback (but this should be rare)
            const userRole = (data.role || '').toLowerCase();
            hasCommunityAccess = ['admin', 'super_admin', 'premium', 'a7fx', 'elite'].includes(userRole);
          }
        } catch (subscriptionError) {
          console.error('Error fetching subscription status on login:', subscriptionError);
          // On error, check role as fallback
          const userRole = (data.role || '').toLowerCase();
          hasCommunityAccess = ['admin', 'super_admin', 'premium', 'a7fx', 'elite'].includes(userRole);
        }
        
        // ============= DETERMINISTIC ROUTING =============
        // STRICT RULES:
        // - hasCommunityAccess === true → ALWAYS go to /community (NEVER /subscription)
        // - hasCommunityAccess === false → ALWAYS go to /subscription
        // This is NON-NEGOTIABLE - paid users must NEVER see subscription page after login
        
        if (hasCommunityAccess) {
          // Paid user or admin → Community
          console.log(`✅ Community access granted (${accessType}) - redirecting to /community`);
          navigate('/community');
        } else {
          // Unpaid user → Subscription page
          console.log('❌ No community access - redirecting to /subscription');
          navigate('/subscription');
        }
        
        return data;
      }
    } catch (error) {
      console.error('Login error:', error);

      let friendlyMessage = '';

      if (error.response) {
        const status = error.response.status;
        const serverMessage = error.response.data?.message || error.response.data?.error;

        if (status === 401) {
          friendlyMessage = serverMessage || 'Incorrect password. Please try again or reset your password.';
        } else if (status === 404) {
          friendlyMessage = serverMessage || 'No account with this email exists. Please sign up for a new account.';
        } else {
          friendlyMessage = serverMessage || Api.handleApiError(error);
        }
      } else if (error.message && error.message.toLowerCase().includes('invalid email or password')) {
        friendlyMessage = 'No account with this email exists or the password is incorrect.';
      } else {
        friendlyMessage = Api.handleApiError(error);
      }

      setError(friendlyMessage);

      // Preserve the original error response so Login.js can access status codes
      const wrappedError = new Error(friendlyMessage);
      if (error.response) {
        wrappedError.response = error.response;
        // Ensure the response data includes the message
        if (!wrappedError.response.data) {
          wrappedError.response.data = {};
        }
        // Preserve original server message if it exists, otherwise use friendly message
        if (!wrappedError.response.data.message) {
          wrappedError.response.data.message = error.response.data?.message || friendlyMessage;
        }
      }
      throw wrappedError;
    } finally {
      setLoading(false);
    }
  };

  // Register function
  const register = async (userData) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await Api.register(userData);
      const data = response.data;
      
      if (data.status === "MFA_REQUIRED") {
        navigate('/verify-mfa', {
          state: {
            userId: data.id,
            email: userData.email,
            requiresVerification: true,
            userData: data
          }
        });
        return;
      }
      
      persistTokens(data.token, data.refreshToken);
      const userInfo = persistUser(data);
      
      sendWelcomeMessage(userInfo.id, userData.email);
      
      if (userInfo.role === 'ADMIN') {
        localStorage.setItem('mfaVerified', 'true');
        setMfaVerified(true);
      }
      
      if (localStorage.getItem('newSignup') === 'true') {
        localStorage.setItem('pendingSubscription', 'true');
        localStorage.removeItem('newSignup');
        navigate('/subscription');
        return data;
      }
      
      localStorage.removeItem('newSignup');
      return data;
    } catch (error) {
      console.error('Registration error:', error);
      setError(Api.handleApiError(error));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Verify MFA function
  const verifyMfa = () => {
    localStorage.setItem('mfaVerified', 'true');
    setMfaVerified(true);
  };

  // Function to send welcome message to new users
  const sendWelcomeMessage = (userId, email) => {
    const welcomeMessage = {
      id: Date.now(),
      text: `Welcome to AURA FX platform, ${email}! 🎉 We're excited to have you join our community. Our admin team is here to help you get started and answer any questions you might have. Feel free to reach out anytime!`,
      sender: 'admin',
      timestamp: new Date().toISOString(),
      read: false
    };

    // Store the welcome message
    const existingMessages = JSON.parse(localStorage.getItem(`messages_${userId}`) || '[]');
    const updatedMessages = [...existingMessages, welcomeMessage];
    localStorage.setItem(`messages_${userId}`, JSON.stringify(updatedMessages));

    // Also notify admin about new user
    const adminNotification = {
      id: Date.now() + 1,
      text: `New user registered: ${email}`,
      sender: 'system',
      timestamp: new Date().toISOString(),
      read: false,
      type: 'user_registration'
    };

    const adminMessages = JSON.parse(localStorage.getItem('admin_notifications') || '[]');
    const updatedAdminMessages = [...adminMessages, adminNotification];
    localStorage.setItem('admin_notifications', JSON.stringify(updatedAdminMessages));
  };

  // Context value
  const value = {
    user,
    loading,
    error,
    token,
    isAuthenticated: !!user,
    login,
    logout,
    register,
    mfaVerified,
    verifyMfa
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
