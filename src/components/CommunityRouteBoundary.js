import React from 'react';

/**
 * Catches render errors in Community so a single bad message row does not black-screen the whole app.
 */
export default class CommunityRouteBoundary extends React.Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error('Community render error:', error, info?.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    style={{
                        padding: '32px 24px',
                        color: '#e2e8f0',
                        background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
                        minHeight: 'calc(100vh - 60px)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        gap: '16px'
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Community couldn’t load</h2>
                    <p style={{ margin: 0, maxWidth: '420px', opacity: 0.85, lineHeight: 1.5 }}>
                        A display error stopped this page. Refresh to try again. If you just deployed, do a hard refresh
                        (Ctrl+Shift+R) so the latest script loads.
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            border: '1px solid rgba(139, 92, 246, 0.5)',
                            background: 'rgba(139, 92, 246, 0.25)',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Refresh page
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
