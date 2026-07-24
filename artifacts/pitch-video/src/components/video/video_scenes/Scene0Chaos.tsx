import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene0Chaos() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)', scale: 1.2 }}
      transition={{ duration: 0.8 }}
    >
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/chaos-docs.png`} 
        alt="Chaos" 
        className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen"
        initial={{ scale: 1.3, rotate: -5 }}
        animate={{ scale: 1.05, rotate: 0 }}
        transition={{ duration: 6, ease: "easeOut" }}
      />
      
      <motion.div 
        className="absolute inset-0 bg-red-900/20 mix-blend-overlay"
        animate={{ opacity: [0, 0.4, 0.1, 0.5, 0] }}
        transition={{ duration: 4, times: [0, 0.2, 0.4, 0.8, 1] }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <motion.h1 
          className="font-display font-black text-[12vw] uppercase leading-none tracking-tighter text-white"
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={phase >= 1 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 50, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          Overwhelmed?
        </motion.h1>
        
        <motion.div 
          className="mt-6 font-mono text-[2vw] text-red-400 tracking-widest uppercase border border-red-500/30 px-6 py-2 bg-red-950/40"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          Construction Chaos is real.
        </motion.div>
      </div>

    </motion.div>
  );
}
