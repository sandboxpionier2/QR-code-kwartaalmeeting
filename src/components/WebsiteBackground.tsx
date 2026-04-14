import { motion } from "motion/react";
import { DuckMatrix } from "./DuckMatrix";
import { RubberDuck } from "./RubberDuck";

export function WebsiteBackground({ duckSrc = "/duck.png" }: { duckSrc?: string }) {
  return (
    <>
      <DuckMatrix duckSrc={duckSrc} />
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ y: [0, -20, 0], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-20 left-10 opacity-20"
        >
          <RubberDuck className="w-24 h-24" src={duckSrc} />
        </motion.div>

        <motion.div
          animate={{ y: [0, 30, 0], rotate: [0, -10, 10, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-40 right-20 opacity-20"
        >
          <RubberDuck className="w-32 h-32" src={duckSrc} />
        </motion.div>

        <motion.div
          animate={{ y: [0, -15, 0], rotate: [0, 8, -8, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute top-1/3 right-1/4 opacity-20"
        >
          <RubberDuck className="w-20 h-20" src={duckSrc} />
        </motion.div>
      </div>
    </>
  );
}
