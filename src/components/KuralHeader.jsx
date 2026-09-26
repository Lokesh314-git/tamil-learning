import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const fallbackKural = {
  line1: 'தமிழ் கற்கலாம்',
  line2: 'அறிவு வளர்க்கலாம்'
};

const KuralHeader = () => {
  const [activeKurals, setActiveKurals] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'thirukkurals'), where('isActive', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => item.line1 && item.line2);
        setActiveKurals(list);
      },
      () => {
        setActiveKurals([]);
      }
    );

    return () => unsub();
  }, []);

  const kural = useMemo(() => {
    if (!activeKurals.length) return fallbackKural;
    const idx = Math.floor(Math.random() * activeKurals.length);
    return activeKurals[idx];
  }, [activeKurals]);

  return (
    <div className="kural-box kural-full">
      <div className="kural-text" aria-label="Thirukkural in Tamil">
        <p className="kural-line">{kural.line1}</p>
        <p className="kural-line">{kural.line2}</p>
      </div>
    </div>
  );
};

export default KuralHeader;

