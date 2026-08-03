import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene2Solution() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3500), // Exiting
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/blueprint-gold.png`} 
        alt="Blueprint" 
        className="absolute inset-0 w-full h-full object-cover opacity-50"
        animate={{ scale: [1, 1.1], rotate: [0, 2] }}
        transition={{ duration: 8, ease: "linear" }}
      />
      
      <div className="absolute inset-0 bg-gradient-to-t from-bg-dark via-transparent to-transparent" />

      <div className="relative z-10 flex flex-col items-center justify-center h-full w-full">
        <motion.p
          className="font-mono text-[1.5vw] text-accent tracking-[0.5em] mb-4 uppercase"
          initial={{ opacity: 0, y: -20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
          transition={{ duration: 0.6 }}
        >
          Meet your new foundation
        </motion.p>
        
        <motion.h1 
          className="font-display font-black text-[12vw] tracking-tighter leading-none"
          initial={{ opacity: 0, scale: 0.5, filter: 'blur(20px)' }}
          animate={phase >= 2 ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : { opacity: 0, scale: 0.5, filter: 'blur(20px)' }}
          transition={{ type: 'spring', stiffness: 150, damping: 15 }}
        >
          <span className="text-white">SITE</span>
          <span className="text-accent">SNAP</span>
        </motion.h1>
      </div>

    </motion.div>
  );
}
