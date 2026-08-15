import React from 'react';
import { AnimatePresence, motion, type Transition, type Variants } from 'framer-motion';

export interface TransitionPanelProps {
  children: React.ReactNode;
  activeKey: string | number;
  className?: string;
  transition?: Transition;
  variants?: Variants;
}

const defaultVariants: Variants = {
  enter: {
    opacity: 0,
    y: 8,
  },
  center: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: -6,
  },
};

const defaultTransition: Transition = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
};

export function TransitionPanel({
  children,
  activeKey,
  className = '',
  transition = defaultTransition,
  variants = defaultVariants,
}: TransitionPanelProps) {
  return (
    <div className={`relative ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeKey}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
          className="h-full w-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default TransitionPanel;
