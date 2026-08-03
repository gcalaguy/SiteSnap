import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene3AIPM() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1600),
      setTimeout(() => setPhase(3), 2600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 overflow-hidden bg-bg-dark"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="absolute inset-0 p-[5vw] flex flex-col justify-center">
        
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <p className="font-mono text-accent text-[1.5vw] uppercase tracking-widest mb-2">01. Intelligence</p>
          <h2 className="font-display font-bold text-[6vw] leading-none text-white max-w-[60vw]">
            AI-POWERED <br />MANAGEMENT
          </h2>
        </motion.div>

        <div className="space-y-6">
          {[
            { text: "Analyzes daily reports instantly", phase: 1 },
            { text: "Generates RFI drafts automatically", phase: 2 },
            { text: "RAG document QA & Conversational AI", phase: 3 }
          ].map((item, i) => (
            <motion.div
              key={i}
              className="flex items-center gap-6"
              initial={{ opacity: 0, y: 20 }}
              animate={phase >= item.phase ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, type: 'spring', bounce: 0.4 }}
            >
              <div className="w-[3vw] h-[3px] bg-accent" />
              <p className="font-body text-[2.5vw] text-gray-300">{item.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
      
      {/* Decorative AI visual element right side */}
      <motion.div 
        className="absolute right-[-10vw] top-1/2 -translate-y-1/2 w-[40vw] h-[40vw] border border-accent/20 rounded-full flex items-center justify-center"
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      >
        <motion.div 
          className="w-[30vw] h-[30vw] border border-accent/40 rounded-full"
          animate={{ rotate: -360 }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        />
        <motion.div 
          className="absolute w-[20vw] h-[20vw] border border-accent/60 rounded-full"
        />
      </motion.div>
    </motion.div>
  );
}
