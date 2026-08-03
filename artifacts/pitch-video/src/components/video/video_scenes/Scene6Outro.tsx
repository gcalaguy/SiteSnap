import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene6Outro() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-bg-dark"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/bg-texture.png`} 
        alt="Texture" 
        className="absolute inset-0 w-full h-full object-cover opacity-30"
        animate={{ scale: [1.1, 1], opacity: [0, 0.3] }}
        transition={{ duration: 2 }}
      />
      
      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <motion.div 
          className="w-[10vw] h-[10vw] mb-6 border-4 border-accent rounded-xl rotate-45 flex items-center justify-center"
          initial={{ scale: 0, rotate: 0 }}
          animate={phase >= 1 ? { scale: 1, rotate: 45 } : { scale: 0, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <motion.div 
            className="w-[4vw] h-[4vw] bg-accent"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        </motion.div>

        <motion.h1 
          className="font-display font-black text-[8vw] tracking-tight text-white leading-none mb-4"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
        >
          SITE SNAP
        </motion.h1>

        <motion.p 
          className="font-body text-[2vw] text-gray-400 tracking-wide"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          End the chaos. Build smarter.
        </motion.p>
      </div>
    </motion.div>
  );
}
