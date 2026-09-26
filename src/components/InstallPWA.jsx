import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

const InstallPWA = ({ className = "sidebar-logout install-app-btn", style = { marginTop: 'auto', marginBottom: '8px', color: '#10b981' } }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert("Browser Notice: \n\nIf you just deleted the app, Chrome temporarily blocks the install button. \n\nTo reinstall now: Look for the small 'Install' icon in your browser's top address bar (near the bookmark star) and click it!\n\n(Note: If the app is already installed, it updates automatically in the background—you don't need to reinstall to get updates!)");
      return;
    }
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    // We've used the prompt, and can't use it again, throw it away
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <button 
      className={className} 
      onClick={handleInstallClick} 
      style={{ ...style, opacity: deferredPrompt ? 1 : 0.6 }}
      title={deferredPrompt ? "Install App" : "App is already installed"}
    >
      <Download size={16} />
      <span>{deferredPrompt ? "Install App" : "App Installed"}</span>
    </button>
  );
};

export default InstallPWA;
