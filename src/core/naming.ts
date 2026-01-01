const adjectives = ["Silent", "Swift", "Patient", "Vibrant", "Steady", "Misty", "Bold", "Calm"];
const animals = ["Fox", "Owl", "Bear", "Wolf", "Otter", "Deer", "Hawk", "Badger"];

export function generateAnonName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const num = Math.floor(1000 + Math.random() * 9000); // 4-digit number
  
  return `${adj}-${animal}-${num}`;
}