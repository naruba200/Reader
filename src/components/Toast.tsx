import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  duration?: number;
  onDone: () => void;
}

export function Toast({ message, duration = 1500, onDone }: ToastProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), duration);
    const t2 = setTimeout(onDone, duration + 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [duration, onDone]);

  return (
    <div
      className={`fixed left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 ${
        exiting ? "toast-exit" : "toast-enter"
      }`}
      style={{ bottom: "70px" }}
    >
      {message}
    </div>
  );
}
