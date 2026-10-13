import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { motion } from 'motion/react';

interface ThemeToggleProps {
  theme: 'dark' | 'light';
  onToggle: () => void;
  variant?: 'pill' | 'compact' | 'icon-only';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  theme,
  onToggle,
  variant = 'pill',
  className = ''
}) => {
  const isDark = theme === 'dark';

  if (variant === 'icon-only') {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={isDark ? 'Switch to Day Mode (Light)' : 'Switch to Night Mode (Dark)'}
        title={isDark ? 'Switch to Day Mode (Light)' : 'Switch to Night Mode (Dark)'}
        className={`relative p-2 rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 active:scale-95 ${
          isDark
            ? 'bg-slate-800/80 hover:bg-slate-750 text-amber-300 border border-white/10 hover:border-amber-400/40 shadow-sm'
            : 'bg-white hover:bg-slate-100 text-indigo-600 border border-slate-200/90 hover:border-indigo-400/40 shadow-sm'
        } ${className}`}
      >
        <motion.div
          key={theme}
          initial={{ rotate: -90, scale: 0.7, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.7, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="flex items-center justify-center"
        >
          {isDark ? (
            <Sun className="w-4 h-4 fill-amber-400/30 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 fill-indigo-500/30 text-indigo-600" />
          )}
        </motion.div>
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={onToggle}
      aria-label={isDark ? 'Switch to Day Mode (Light)' : 'Switch to Night Mode (Dark)'}
      title={isDark ? 'Currently in Night Mode. Click for Day Mode.' : 'Currently in Day Mode. Click for Night Mode.'}
      className={`group relative flex items-center justify-between p-1 rounded-full transition-all duration-300 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 active:scale-[0.98] ${
        isDark 
          ? 'w-[72px] h-8 bg-slate-900/90 border border-slate-700/80 shadow-inner hover:border-pink-500/40' 
          : 'w-[72px] h-8 bg-slate-200/90 border border-slate-300 shadow-inner hover:border-amber-500/40'
      } ${className}`}
    >
      {/* Background track ambient icons */}
      <span className="absolute left-2 flex items-center justify-center text-amber-400 transition-opacity duration-200 pointer-events-none opacity-40 group-hover:opacity-70">
        <Sun className="w-3.5 h-3.5" />
      </span>
      <span className="absolute right-2 flex items-center justify-center text-cyan-300 transition-opacity duration-200 pointer-events-none opacity-40 group-hover:opacity-70">
        <Moon className="w-3.5 h-3.5" />
      </span>

      {/* Sliding illuminated switch knob */}
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-all duration-200 ${
          isDark
            ? 'ml-auto bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-purple-900/40 border border-white/20'
            : 'mr-auto bg-gradient-to-tr from-amber-400 to-orange-400 text-amber-950 shadow-amber-500/30 border border-white/80'
        }`}
      >
        {isDark ? (
          <Moon className="w-3 h-3 text-cyan-100 fill-white/20" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-amber-950 fill-amber-200/50" />
        )}
      </motion.div>

      {/* Screen-reader text */}
      <span className="sr-only">
        {isDark ? 'Night Mode Active. Click to switch to Day Mode.' : 'Day Mode Active. Click to switch to Night Mode.'}
      </span>
    </button>
  );
};
