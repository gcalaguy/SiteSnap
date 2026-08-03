import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene4Finance() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 1800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 overflow-hidden bg-bg-dark"
      initial={{ opacity: 0, y: '50vh' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/ui-dashboard.png`} 
        alt="Dashboard UI" 
        className="absolute right-[-5vw] bottom-[-5vw] w-[65vw] object-contain opacity-80 rounded-tl-3xl shadow-[0_0_100px_rgba(245,158,11,0.2)]"
        initial={{ x: '20vw', opacity: 0 }}
        animate={phase >= 1 ? { x: 0, opacity: 0.8 } : { x: '20vw', opacity: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />

      <div className="absolute inset-0 p-[5vw] flex flex-col justify-center w-[50vw]">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          <p className="font-mono text-accent text-[1.5vw] uppercase tracking-widest mb-2">02. Financials</p>
          <h2 className="font-display font-bold text-[5vw] leading-[1.1] text-white mb-8">
            SMART ESTIMATOR <br />& BILLING
          </h2>
        </motion.div>

        <div className="space-y-4">
          {["AI + Rule-based Quotes", "Change Orders & Payments", "OCR Receipt Extraction", "QuickBooks & Stripe Integrated"].map((text, i) => (
            <motion.div
              key={i}
              className="bg-glass px-6 py-4 rounded-xl border-l-4 border-l-accent"
              initial={{ opacity: 0, x: -30 }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              <p className="font-body text-[2vw] text-white font-medium">{text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
