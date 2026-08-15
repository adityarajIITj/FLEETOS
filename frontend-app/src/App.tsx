import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import OnboardingStory from './pages/OnboardingStory';
import CommandCenter from './pages/CommandCenter';
import DriverWorkspace from './pages/DriverWorkspace';
import AdminPortal from './pages/AdminPortal';
import CustomerPortal from './pages/CustomerPortal';

function AppFlow() {
  const { user, isAuthenticated } = useAuth();
  const [inApp, setInApp] = useState<boolean>(isAuthenticated);
  const [adminView, setAdminView] = useState<'admin' | 'command'>(() => {
    return window.location.hash === '#command' ? 'command' : 'admin';
  });

  // Sync with auth state changes (e.g. on logout)
  useEffect(() => {
    if (!isAuthenticated) {
      setInApp(false);
    } else {
      setInApp(true);
    }
  }, [isAuthenticated]);

  if (!inApp || !user) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="onboarding-story"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.99 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="h-full w-full"
        >
          <OnboardingStory onComplete={() => setInApp(true)} />
        </motion.div>
      </AnimatePresence>
    );
  }

  // --- Strict Role Routing ---

  // 1. DRIVER ROLE — Isolated to Driver Workspace
  if (user.role === 'driver') {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="driver-workspace"
          initial={{ opacity: 0, scale: 1.01 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="h-full w-full"
        >
          <DriverWorkspace />
        </motion.div>
      </AnimatePresence>
    );
  }

  // 2. ADMIN ROLE — Dedicated Admin Portal with quick switch to Command Center
  if (user.role === 'admin') {
    return (
      <AnimatePresence mode="wait">
        {adminView === 'admin' ? (
          <motion.div
            key="admin-portal"
            initial={{ opacity: 0, scale: 1.01 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-full"
          >
            <AdminPortal onSwitchToCommandCenter={() => setAdminView('command')} />
          </motion.div>
        ) : (
          <motion.div
            key="admin-command-center"
            initial={{ opacity: 0, scale: 1.01 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-full"
          >
            <CommandCenter />
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // 3. CUSTOMER ROLE — Customer Portal
  if (user.role === 'client') {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="customer-portal"
          initial={{ opacity: 0, scale: 1.01 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="h-full w-full"
        >
          <CustomerPortal />
        </motion.div>
      </AnimatePresence>
    );
  }

  // 4. DISPATCHER ROLE — Dispatcher Command Center
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="command-center"
        initial={{ opacity: 0, scale: 1.01 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="h-full w-full"
      >
        <CommandCenter />
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppFlow />
      </AuthProvider>
    </ThemeProvider>
  );
}
