import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene1Problem() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const items = [
    { text: "Lost Paperwork", x: "-10vw", y: "-15vh", phase: 1 },
    { text: "Disconnected Teams", x: "15vw", y: "0vh", phase: 2 },
    { text: "Financial Blind Spots", x: "-5vw", y: "15vh", phase: 3 },
  ];

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-bg-dark"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: '-20vw' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative w-full h-full">
        {items.map((item, i) => (
          <motion.div
            key={i}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-glass px-8 py-6 rounded-2xl shadow-2xl"
            initial={{ opacity: 0, x: `calc(-50% + ${item.x})`, y: `calc(-50% + ${item.y} + 50px)`, rotate: Math.random() * 10 - 5 }}
            animate={phase >= item.phase 
              ? { opacity: 1, x: `calc(-50% + ${item.x})`, y: `calc(-50% + ${item.y})`, rotate: 0 } 
              : { opacity: 0, x: `calc(-50% + ${item.x})`, y: `calc(-50% + ${item.y} + 50px)`, rotate: Math.random() * 10 - 5 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            style={{ zIndex: 10 + i }}
          >
            <h2 className="font-display font-bold text-[3vw] text-white">
              {item.text}
            </h2>
          </motion.div>
        ))}
      </div>
      
      {/* Glitch transition effect at the end */}
      <motion.div 
        className="absolute inset-0 bg-white"
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: [0, 1, 0, 0.8, 0] } : { opacity: 0 }}
        transition={{ delay: 1.2, duration: 0.4, times: [0, 0.2, 0.4, 0.6, 1] }}
      />
    </motion.div>
  );
}
