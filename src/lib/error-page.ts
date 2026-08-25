/** Stub — minimal fallback error HTML for SSR. */
export function renderErrorPage(): string {
  return `<!DOCTYPE html><html lang="en"><body style="background:#0a0a0f;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><div style="font-size:10px;letter-spacing:.2em;color:#666;text-transform:uppercase">Garuda</div><h1 style="font-size:1.25rem;margin:.5rem 0">Server error / ಸರ್ವರ್ ದೋಷ</h1><p style="color:#999;font-size:.875rem">Please try again or contact the administrator.<br>ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ನಿರ್ವಾಹಕರನ್ನು ಸಂಪರ್ಕಿಸಿ.</p><a href="/" style="color:#5a8cff">Return to dashboard / ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ಗೆ ಹಿಂತಿರುಗಿ</a></div></body></html>`;
}
