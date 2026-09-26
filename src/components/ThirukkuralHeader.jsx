import React, { useMemo } from "react";

const thirukuralList = [
  {
    number: 1,
    tamil: "அகர முதல எழுத்தெல்லாம் ஆதி பகவன் முதற்றே உலகு",
    meaning: "As the letter A is first among letters, so is the Eternal God first in the world."
  },
  {
    number: 2,
    tamil: "கற்றது கைமண் அளவு; கல்லாதது உலகளவு",
    meaning: "What we have learned is a handful; what we haven't is the size of the world."
  },
  {
    number: 133,
    tamil: "தீயினால் சுட்ட புண் ஆறும்; நாவினால் சுட்ட வடு ஆறாது",
    meaning: "A burn from fire may heal; a burn from words may never heal."
  },
  {
    number: 423,
    tamil: "அறம் செய விரும்பு; அது வாழ்வின் உயர்ந்த பயன்",
    meaning: "Desire to do good; it is the highest purpose of life."
  },
  {
    number: 571,
    tamil: "ஒழுக்கம் விழுப்பத்து உயர்வு தரும்; ஒழுக்கம் உயிரினும் ஓம்பப்படும்",
    meaning: "Discipline gives dignity and growth; guard it more than life."
  }
];

const ThirukkuralHeader = ({ placement = "below" }) => {
  const kural = useMemo(() => {
    const idx = Math.floor(Math.random() * thirukuralList.length);
    return thirukuralList[idx];
  }, []);

  if (!kural) return null;

  return (
    <div className={`kural ${placement === "inline" ? "kural-inline" : ""}`}>
      <div className="kural-tamil">“{kural.tamil}”</div>
      <div className="kural-meaning">{kural.meaning}</div>
      <div className="kural-number">Kural {kural.number}</div>
    </div>
  );
};

export default ThirukkuralHeader;
