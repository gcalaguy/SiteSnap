import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene5Field() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 overflow-hidden bg-bg-dark flex items-center"
      initial={{ filter: 'blur(20px)', opacity: 0 }}
      animate={{ filter: 'blur(0px)', opacity: 1 }}
      exit={{ x: '-100vw' }}
      transition={{ duration: 0.8 }}
    >
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/ui-mobile.png`} 
        alt="Mobile UI" 
        className="absolute left-[5vw] w-[35vw] object-contain opacity-90 shadow-2xl"
        initial={{ y: '20vh', opacity: 0 }}
        animate={phase >= 1 ? { y: 0, opacity: 0.9 } : { y: '20vh', opacity: 0 }}
        transition={{ duration: 1, type: 'spring', bounce: 0.2 }}
      />

      <div className="absolute right-[5vw] w-[50vw] flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
          transition={{ duration: 0.6 }}
        >
          <p className="font-mono text-accent text-[1.5vw] uppercase tracking-widest mb-2">03. Operations</p>
          <h2 className="font-display font-bold text-[5.5vw] leading-[1.1] text-white mb-8">
            FIELD CREW <br />COLLABORATION
          </h2>
        </motion.div>

        <div className="flex flex-wrap gap-4">
          {[
            "Offline-First Sync", 
            "Voice-to-Text", 
            "Photo Capture", 
            "Kanban CRM",
            "Safety Forms",
            "Admin Panel"
          ].map((pill, i) => (
            <motion.div
              key={i}
              className="bg-accent/10 border border-accent/30 text-accent px-6 py-3 rounded-full font-body text-[1.8vw]"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.4, delay: i * 0.1, type: 'spring' }}
            >
              {pill}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
