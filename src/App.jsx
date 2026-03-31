import { useState, useEffect, useRef } from "react";

// WHALEMON TCG — Complete Frontend v2
// Tempo Chain ID: 4217 | WHEL: 0x3e12fcb20ad532f653f2907d2ae511364e2ae696 | PATHUSD: 0x20c0000000000000000000000000000000000000

const TEMPO_CHAIN = { id: 4217, name: "Tempo Network", rpc: "https://rpc.tempo.xyz", explorer: "https://explore.tempo.xyz", currency: "PATHUSD" };
const CONTRACTS = { WHEL_NFT: "0x3e12fcb20ad532f653f2907d2ae511364e2ae696", WHALE_CARDS: "0xf482221cf5150868956D80cdE00F589dC227D78A", BATTLE_ARENA: "0x7C220371C08285dBc06C641EC42552A57A85215A", MARKETPLACE: "0xF66E45889adDc6e330B38C0727567f2608EEC475", PATHUSD: "0x20c0000000000000000000000000000000000000" };
const ELEMENTS = [
  { name: "Abyss", color: "#6d28d9", icon: "\u{1F30A}", bg: "linear-gradient(135deg, #1a0a2e, #2d1b69)" },
  { name: "Tide", color: "#0ea5e9", icon: "\u{1F300}", bg: "linear-gradient(135deg, #0c4a6e, #0ea5e9)" },
  { name: "Storm", color: "#8b5cf6", icon: "\u26A1", bg: "linear-gradient(135deg, #2e1065, #7c3aed)" },
  { name: "Frost", color: "#67e8f9", icon: "\u2744\uFE0F", bg: "linear-gradient(135deg, #083344, #22d3ee)" },
  { name: "Coral", color: "#f472b6", icon: "\u{1FAB8}", bg: "linear-gradient(135deg, #500724, #ec4899)" },
  { name: "Leviathan", color: "#dc2626", icon: "\u{1F525}", bg: "linear-gradient(135deg, #450a0a, #dc2626)" }
];
const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
const RARITY_COLORS = ["#94a3b8", "#22c55e", "#3b82f6", "#a855f7", "#f59e0b"];
const F = "'JetBrains Mono', monospace";
const nftImg = (id, bg = "0c4a6e", fg = "38bdf8") => `https://placehold.co/400x400/${bg}/${fg}?text=WHEL+%23${id}`;

const MOCK_WHALES = [
  { id: 42, image: nftImg(42), traits: { background: "Deep Ocean", body: "Blue Whale", accessory: "Crown", eyes: "Laser" } },
  { id: 108, image: nftImg(108, "083344", "67e8f9"), traits: { background: "Arctic", body: "Beluga", accessory: "Monocle", eyes: "Wise" } },
  { id: 777, image: nftImg(777, "500724", "f472b6"), traits: { background: "Coral Reef", body: "Narwhal", accessory: "Trident", eyes: "Ruby" } },
  { id: 1337, image: nftImg(1337, "1a0a2e", "8b5cf6"), traits: { background: "Abyss", body: "Orca", accessory: "Shield", eyes: "Storm" } },
  { id: 2501, image: nftImg(2501, "0c4a6e", "0ea5e9"), traits: { background: "Tidal Wave", body: "Humpback", accessory: "Anchor", eyes: "Diamond" } },
  { id: 3000, image: nftImg(3000, "450a0a", "dc2626"), traits: { background: "Bioluminescent", body: "Sperm Whale", accessory: "Helm", eyes: "Void" } }
];

const ALL_CARDS = [
  { id: 42, image: nftImg(42), element: 0, rarity: 4, attack: 87, defense: 62, health: 280, speed: 45, ability: "Abyssal Crush", abilityDesc: "2x vs Frost", listed: true, price: "85.00", seller: "0x7fA3...b29E" },
  { id: 108, image: nftImg(108, "083344", "67e8f9"), element: 3, rarity: 2, attack: 55, defense: 88, health: 200, speed: 72, ability: "Frozen Shield", abilityDesc: "50% block 2 turns", listed: false, price: null, seller: null },
  { id: 777, image: nftImg(777, "500724", "f472b6"), element: 4, rarity: 3, attack: 78, defense: 45, health: 180, speed: 91, ability: "Coral Barrage", abilityDesc: "3x30% hits", listed: true, price: "45.00", seller: "0x92eC...1a7D" },
  { id: 555, image: nftImg(555, "083344", "67e8f9"), element: 1, rarity: 1, attack: 44, defense: 65, health: 170, speed: 58, ability: "Riptide Slash", abilityDesc: "Speed bonus dmg", listed: true, price: "12.50", seller: "0xd8B1...c44F" },
  { id: 1024, image: nftImg(1024, "2e1065", "7c3aed"), element: 2, rarity: 3, attack: 72, defense: 51, health: 210, speed: 84, ability: "Thunder Breach", abilityDesc: "Ignores 50% def", listed: true, price: "38.00", seller: "0xfA01...88eB" },
  { id: 2888, image: nftImg(2888, "450a0a", "dc2626"), element: 5, rarity: 0, attack: 38, defense: 42, health: 150, speed: 35, ability: "Crushing Jaw", abilityDesc: "HP scaling", listed: true, price: "8.00", seller: "0x3c5D...f92A" },
  { id: 314, image: nftImg(314, "0c4a6e", "0ea5e9"), element: 1, rarity: 2, attack: 61, defense: 70, health: 195, speed: 67, ability: "Tidal Surge", abilityDesc: "Area wave", listed: false, price: null, seller: null },
  { id: 1999, image: nftImg(1999, "1a0a2e", "6d28d9"), element: 0, rarity: 1, attack: 48, defense: 55, health: 175, speed: 50, ability: "Dark Descent", abilityDesc: "-40% enemy speed", listed: true, price: "15.00", seller: "0xA1b2...3c4D" }
];

const RECENT_SALES = [
  { id: 314, price: "38.00", from: "0x92eC", to: "0x7fA3", time: "2m", element: 1 },
  { id: 888, price: "95.00", from: "0xfA01", to: "0xd8B1", time: "18m", element: 5 },
  { id: 2100, price: "15.75", from: "0x3c5D", to: "0x92eC", time: "1h", element: 0 },
  { id: 450, price: "22.00", from: "0xA1b2", to: "0xE5f6", time: "3h", element: 3 },
  { id: 3100, price: "110.00", from: "0x7fA3", to: "0x9CdE", time: "5h", element: 4 }
];

// Components
const Btn = ({ children, onClick, bg = "linear-gradient(135deg,#0ea5e9,#6366f1)", disabled, small, style: s = {} }) => (
  <button onClick={onClick} disabled={disabled} style={{ padding: small ? "6px 14px" : "10px 22px", borderRadius: 8, background: disabled ? "#1e293b" : bg, border: "none", color: disabled ? "#475569" : "white", fontSize: small ? 10 : 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", fontFamily: F, transition: "all 0.15s", ...s }}
    onMouseDown={e => !disabled && (e.currentTarget.style.transform = "scale(0.96)")} onMouseUp={e => e.currentTarget.style.transform = "scale(1)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>{children}</button>
);
const Tag = ({ children, color = "#64748b", active, onClick }) => (
  <button onClick={onClick} style={{ padding: "4px 9px", borderRadius: 5, fontSize: 9, fontFamily: F, background: active ? `${color}20` : "transparent", border: `1px solid ${active ? color + "50" : "#1e293b"}`, color: active ? color : "#64748b", cursor: "pointer", transition: "all 0.15s" }}>{children}</button>
);
const StatMini = ({ l, v, c }) => <div style={{ textAlign: "center" }}><div style={{ fontSize: 7, color: "#475569", fontFamily: F }}>{l}</div><div style={{ fontSize: 11, color: c, fontWeight: 700, fontFamily: F }}>{v}</div></div>;
const StatBar = ({ label, value, max, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
    <span style={{ width: 28, fontSize: 8, color: "#64748b", fontFamily: F }}>{label}</span>
    <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${(value/max)*100}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.5s" }} /></div>
    <span style={{ width: 22, fontSize: 10, color: "#e2e8f0", fontFamily: F, textAlign: "right", fontWeight: 700 }}>{value}</span>
  </div>
);
const CardImg = ({ src, el, h = 130 }) => (
  <div style={{ height: h, background: ELEMENTS[el]?.bg || "#0f172a", overflow: "hidden", position: "relative" }}>
    {src && <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    {!src && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}><span style={{ fontSize: h > 100 ? 44 : 28 }}>{"\u{1F433}"}</span></div>}
  </div>
);

function GameCard({ card, size = "normal", onClick }) {
  const el = ELEMENTS[card.element]; const lg = size === "large"; const w = lg ? 290 : 200; const h = lg ? 400 : 285;
  return (
    <div onClick={onClick} style={{ width: w, maxWidth: "100%", height: h, borderRadius: 12, background: "#0a0e27", border: `2px solid ${el.color}35`, boxShadow: `0 0 20px ${el.color}10`, cursor: onClick ? "pointer" : "default", overflow: "hidden", transition: "all 0.2s", flexShrink: 0 }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 6px 30px ${el.color}20`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = `0 0 20px ${el.color}10`; }}>
      <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 2, background: RARITY_COLORS[card.rarity], opacity: 0.6, borderRadius: "0 0 3px 3px" }} />
      <div style={{ padding: lg ? "10px 12px 4px" : "6px 8px 3px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: F, fontSize: lg ? 12 : 9, color: "#e2e8f0", fontWeight: 700 }}>#{card.id}</span>
        <span style={{ fontFamily: F, fontSize: lg ? 9 : 7, color: el.color }}>{el.icon} {el.name}</span>
      </div>
      <div style={{ margin: lg ? "0 10px" : "0 6px", borderRadius: 7, overflow: "hidden" }}><CardImg src={card.image} el={card.element} h={lg ? 155 : 100} /></div>
      <div style={{ padding: lg ? "6px 12px 2px" : "4px 8px 1px" }}>
        <div style={{ fontFamily: F, fontSize: lg ? 11 : 8, color: "#e2e8f0", fontWeight: 700 }}>Whalemon #{card.id}</div>
        <div style={{ fontFamily: F, fontSize: lg ? 8 : 6, color: RARITY_COLORS[card.rarity], textTransform: "uppercase", letterSpacing: 1.5, marginTop: 1 }}>{"\u2605"} {RARITIES[card.rarity]}</div>
      </div>
      <div style={{ padding: lg ? "5px 12px" : "2px 8px" }}>
        <StatBar label="ATK" value={card.attack} max={100} color="#f87171" />
        <StatBar label="DEF" value={card.defense} max={100} color="#60a5fa" />
        <StatBar label="HP" value={card.health} max={300} color="#4ade80" />
        <StatBar label="SPD" value={card.speed} max={100} color="#facc15" />
      </div>
      {card.ability && lg && <div style={{ margin: "2px 10px 8px", padding: "5px 7px", borderRadius: 5, background: `${el.color}0d`, border: `1px solid ${el.color}15` }}>
        <div style={{ fontFamily: F, fontSize: 8, color: el.color, fontWeight: 700 }}>{card.ability}</div>
        <div style={{ fontFamily: F, fontSize: 7, color: "#94a3b8" }}>{card.abilityDesc}</div>
      </div>}
    </div>
  );
}

function MktCard({ card, isOwner, onBuy, onCancel, onOffer }) {
  const el = ELEMENTS[card.element];
  return (
    <div style={{ width: 200, maxWidth: "100%", minWidth: 160, borderRadius: 10, background: "#0a0e27", border: `1px solid ${el.color}18`, overflow: "hidden", transition: "all 0.2s", flexShrink: 0 }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 4px 20px ${el.color}12`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ position: "relative" }}>
        <CardImg src={card.image} el={card.element} h={120} />
        <div style={{ position: "absolute", top: 5, right: 5, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.6)", fontSize: 7, color: RARITY_COLORS[card.rarity], fontFamily: F, fontWeight: 700 }}>{"\u2605"} {RARITIES[card.rarity]}</div>
        <div style={{ position: "absolute", top: 5, left: 5, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.6)", fontSize: 7, color: el.color, fontFamily: F }}>{el.icon} {el.name}</div>
      </div>
      <div style={{ padding: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", fontFamily: F }}>#{card.id}</span>
          {card.seller && <span style={{ fontSize: 7, color: "#475569", fontFamily: F }}>{card.seller}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, marginBottom: 6 }}>
          <StatMini l="ATK" v={card.attack} c="#f87171" /><StatMini l="DEF" v={card.defense} c="#60a5fa" /><StatMini l="HP" v={card.health} c="#4ade80" /><StatMini l="SPD" v={card.speed} c="#facc15" />
        </div>
        {card.listed && card.price ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div><div style={{ fontSize: 6, color: "#475569", fontFamily: F }}>PRICE</div><div style={{ fontSize: 14, fontWeight: 800, color: "#4ade80", fontFamily: F }}>${card.price}</div></div>
            {isOwner ? <Btn small onClick={() => onCancel?.(card)} bg="#dc262615" style={{ color: "#f87171", border: "1px solid #f8717125" }}>Cancel</Btn>
              : <div style={{ display: "flex", gap: 3 }}><Btn small onClick={() => onBuy?.(card)}>Buy</Btn><Btn small onClick={() => onOffer?.(card)} bg="#1e293b" style={{ border: "1px solid #334155", color: "#94a3b8" }}>Offer</Btn></div>}
          </div>
        ) : <Btn small onClick={() => onOffer?.(card)} bg="#1e293b" style={{ width: "100%", border: "1px solid #334155", color: "#94a3b8" }}>Make Offer</Btn>}
      </div>
    </div>
  );
}

// ═══ MAIN ═══
export default function WhalemonTCG() {
  const [connected, setConnected] = useState(false);
  const [walletAddr, setWalletAddr] = useState("");
  const [walletBalance, setWalletBalance] = useState("0.00");
  const [page, setPage] = useState("whales");
  const [mintedIds, setMintedIds] = useState(new Set([42, 108, 777]));
  const [selectedCard, setSelectedCard] = useState(null);
  const [minting, setMinting] = useState(null);
  const [notif, setNotif] = useState(null);
  const [revealCard, setRevealCard] = useState(null);
  const [revealPhase, setRevealPhase] = useState(null);
  const [battleState, setBattleState] = useState(null);
  const [battleMode, setBattleMode] = useState(null);
  const [pCard, setPCard] = useState(null);
  const [oCard, setOCard] = useState(null);
  const [bLog, setBLog] = useState([]);
  const [bTurn, setBTurn] = useState(1);
  const [abCd, setAbCd] = useState(0);
  const [bResult, setBResult] = useState(null);
  const [mktTab, setMktTab] = useState("listed");
  const [mktSort, setMktSort] = useState("price-asc");
  const [fEl, setFEl] = useState(null);
  const [fRar, setFRar] = useState(null);
  const [fMinAtk, setFMinAtk] = useState("");
  const [showList, setShowList] = useState(false);
  const [bulkIds, setBulkIds] = useState(new Set());
  const [bulkPrice, setBulkPrice] = useState("");
  const [listPrices, setListPrices] = useState({});
  const [showOffer, setShowOffer] = useState(false);
  const [offerTarget, setOfferTarget] = useState(null);
  const [offerAmt, setOfferAmt] = useState("");

useEffect(() => {
  if(!connected || !walletAddr) return;
  const loadData = async () => {
    try {
      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const bal = await provider.getBalance(walletAddr);
      const formatted = parseFloat(window.ethers.formatEther(bal)).toFixed(2);
      setWalletBalance(formatted);
    } catch(e) { console.log("Balance error:", e); }
  };
  loadData();
}, [connected, walletAddr]);
  const notify = (m, t = "success") => { setNotif({ m, t }); setTimeout(() => setNotif(null), 3000); };
  const handleConnect = async () => { try { if(!window.ethereum) { alert("Please install MetaMask!"); return; } const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }); if(!accounts || accounts.length === 0) return; try { await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x1079", chainName: "Tempo Network", rpcUrls: ["https://rpc.tempo.xyz"], nativeCurrency: { name: "PATHUSD", symbol: "PATHUSD", decimals: 18 }, blockExplorerUrls: ["https://explore.tempo.xyz"] }] }); } catch(chainErr) { console.log("Chain add error:", chainErr); } setWalletAddr(accounts[0]); setConnected(true); } catch(e) { alert("Connection failed: " + e.message); } };
  const handleDisconnect = () => { setConnected(false); setWalletAddr(""); setWalletBalance("0.00"); setPage("whales"); notify("Disconnected", "info"); };

  const handleMint = async (id) => {
    setMinting(id); setRevealPhase("minting"); await new Promise(r => setTimeout(r, 1500));
    setMintedIds(p => new Set([...p, id])); setRevealPhase("generating"); await new Promise(r => setTimeout(r, 2200));
    const el = Math.floor(Math.random()*6), rar = [0,0,0,0,1,1,1,2,2,3,4][Math.floor(Math.random()*11)], w = MOCK_WHALES.find(w => w.id===id);
    const c = { id, image: w?.image, element: el, rarity: rar, attack: 30+Math.floor(Math.random()*60), defense: 30+Math.floor(Math.random()*60), health: 100+Math.floor(Math.random()*180), speed: 30+Math.floor(Math.random()*60), ability: ["Void Pulse","Riptide Slash","Thunder Breach","Ice Barb","Reef Sting","Crushing Jaw"][el], abilityDesc: "A powerful ocean attack." };
    setRevealCard(c); setRevealPhase("revealing"); await new Promise(r => setTimeout(r, 600)); setRevealPhase("done"); setMinting(null);
  };

  // Battle
  const startBattle = m => { setBattleMode(m); setBattleState("select"); setBLog([]); setBTurn(1); setAbCd(0); setBResult(null); setPCard(null); setOCard(null); };
  const pickCard = c => {
    setPCard({ ...c, currentHp: c.health }); const el = Math.floor(Math.random()*6), r = [0,0,1,1,2,2,3][Math.floor(Math.random()*7)], m = [1,1.1,1.25,1.4,1.6][r];
    const hp = Math.round((100+Math.random()*150)*m);
    setOCard({ id:"AI", image: null, element: el, rarity: r, attack: Math.round((30+Math.random()*50)*m), defense: Math.round((30+Math.random()*50)*m), health: hp, speed: Math.round((30+Math.random()*50)*m), ability: ["Void Pulse","Riptide Slash","Thunder Breach","Ice Barb","Reef Sting","Crushing Jaw"][el], abilityDesc: "Deep sea attack.", currentHp: hp });
    setBattleState("fighting"); setBLog([{ t: 0, txt: `Battle started! ${battleMode==="free"?"(Practice)":"(Ranked - 1 PATHUSD)"}`, tp: "sys" }]);
  };
  const adv = (a,d) => ({0:3,3:4,4:1,1:5,5:2,2:0}[a]===d);
  const dmg = (a,d,ab,ad) => Math.max(5, Math.round((a.attack*100/(100+d.defense))*(ab?1.8:1)*(ad?1.5:1)*(0.9+Math.random()*0.2)));
  const doMove = async mv => {
    if(!pCard||!oCard||bResult) return; const p={...pCard},o={...oCard},l=[...bLog]; let cd=abCd, t=bTurn;
    const pa=adv(p.element,o.element);
    if(mv==="atk"){const d=dmg(p,o,false,pa);o.currentHp-=d;l.push({t,txt:`Attack: ${d} dmg!${pa?" \u26A1":""}`,tp:"p"});}
    else if(mv==="ab"){if(cd>0)return;const d=dmg(p,o,true,pa);o.currentHp-=d;cd=3;l.push({t,txt:`${p.ability}: ${d} dmg!${pa?" \u26A1":""}`,tp:"pa"});}
    else{l.push({t,txt:"Defend! (50% reduction next hit)",tp:"pd"});}
    if(o.currentHp<=0){o.currentHp=0;l.push({t,txt:"Enemy defeated! Victory! \u{1F3C6}",tp:"win"});setPCard(p);setOCard(o);setBLog(l);setBResult("win");return;}
    await new Promise(r=>setTimeout(r,600));
    const oa=adv(o.element,p.element),roll=Math.random();
    if(o.currentHp<o.health*.3&&roll<.3){l.push({t,txt:"Enemy defends!",tp:"od"});}
    else if(roll<.35){let d=dmg(o,p,true,oa);if(mv==="def")d=Math.round(d/2);p.currentHp-=d;l.push({t,txt:`Enemy ${o.ability}: ${d} dmg!${oa?" \u26A1":""}`,tp:"oa"});}
    else{let d=dmg(o,p,false,oa);if(mv==="def")d=Math.round(d/2);p.currentHp-=d;l.push({t,txt:`Enemy attacks: ${d} dmg!${oa?" \u26A1":""}`,tp:"o"});}
    if(p.currentHp<=0){p.currentHp=0;l.push({t,txt:"Defeated! \u{1F480}",tp:"lose"});setBResult("lose");}
    if(t>=30&&!bResult){const r=p.currentHp>o.currentHp?"win":p.currentHp<o.currentHp?"lose":"draw";l.push({t,txt:`Max turns! ${r==="win"?"Win!":r==="lose"?"Lose.":"Draw!"}`,tp:"sys"});setBResult(r);}
    setPCard(p);setOCard(o);setBLog(l);setBTurn(t+1);setAbCd(Math.max(0,cd-1));
  };
  const exitBattle = () => { setBattleState(null); setBattleMode(null); setPCard(null); setOCard(null); setBLog([]); setBResult(null); };

  // Market
  const getCards = () => {
    let c = mktTab==="listed"?ALL_CARDS.filter(x=>x.listed):mktTab==="myListings"?ALL_CARDS.filter(x=>x.listed&&x.seller===walletAddr):ALL_CARDS;
    if(fEl!==null) c=c.filter(x=>x.element===fEl);
    if(fRar!==null) c=c.filter(x=>x.rarity===fRar);
    if(fMinAtk&&!isNaN(fMinAtk)) c=c.filter(x=>x.attack>=parseInt(fMinAtk));
    if(mktSort==="price-asc") c=[...c].sort((a,b)=>(parseFloat(a.price)||999)-(parseFloat(b.price)||999));
    else if(mktSort==="price-desc") c=[...c].sort((a,b)=>(parseFloat(b.price)||0)-(parseFloat(a.price)||0));
    else if(mktSort==="rarity-desc") c=[...c].sort((a,b)=>b.rarity-a.rarity);
    else if(mktSort==="rarity-asc") c=[...c].sort((a,b)=>a.rarity-b.rarity);
    else if(mktSort==="power-desc") c=[...c].sort((a,b)=>(b.attack+b.defense+b.health+b.speed)-(a.attack+a.defense+a.health+a.speed));
    return c;
  };

  const css = `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap');
@keyframes bubbleRise{0%{transform:translateY(0);opacity:0}10%{opacity:.5}100%{transform:translateY(-100vh);opacity:0}}
@keyframes slideUp{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{0%{opacity:0}100%{opacity:1}}@keyframes spin{to{transform:rotate(360deg)}}
@keyframes notifSlide{0%{transform:translateX(100%);opacity:0}100%{transform:translateX(0);opacity:1}}
@keyframes cardFlip{0%{transform:perspective(800px) rotateY(180deg) scale(.8);opacity:0}50%{transform:perspective(800px) rotateY(90deg) scale(1.05)}100%{transform:perspective(800px) rotateY(0) scale(1);opacity:1}}
@keyframes revealGlow{0%{box-shadow:0 0 20px transparent}50%{box-shadow:0 0 60px rgba(14,165,233,.5)}100%{box-shadow:0 0 30px rgba(14,165,233,.12)}}
@keyframes textReveal{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
/* ═══ MOBILE RESPONSIVE ═══ */
.wm-header-wallet{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wm-cards-grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.wm-market-layout{display:flex;gap:14px}
.wm-market-main{flex:1;min-width:0}
.wm-market-sidebar{width:200px;flex-shrink:0}
.wm-lb-grid{display:grid;grid-template-columns:40px 1fr 60px 60px 60px 60px;padding:10px 14px;font-size:10px;align-items:center}
.wm-lb-header{display:grid;grid-template-columns:40px 1fr 60px 60px 60px 60px;padding:8px 14px;font-size:7px}
.wm-battle-field{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.wm-modal{width:440px;max-height:80vh;overflow-y:auto}
.wm-modal-sm{width:340px}
.wm-header-info{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
@media(max-width:768px){
  .wm-market-layout{flex-direction:column}
  .wm-market-sidebar{width:100%;order:-1}
  .wm-lb-grid{grid-template-columns:32px 1fr 44px 44px 44px 44px;padding:8px 8px;font-size:9px}
  .wm-lb-header{grid-template-columns:32px 1fr 44px 44px 44px 44px;padding:6px 8px;font-size:6px}
  .wm-modal{width:calc(100vw - 32px);max-width:440px}
  .wm-modal-sm{width:calc(100vw - 32px);max-width:340px}
  .wm-header-info{gap:4px}
}
@media(max-width:480px){
  .wm-cards-grid{gap:8px}
  .wm-lb-grid{grid-template-columns:28px 1fr 36px 36px 36px 36px;padding:6px 6px;font-size:8px}
  .wm-lb-header{grid-template-columns:28px 1fr 36px 36px 36px 36px;padding:5px 6px;font-size:5px}
  .wm-battle-field{gap:8px}
}`;
  const Bubbles = () => <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>{Array.from({length:12}).map((_,i)=><div key={i} style={{position:"absolute",bottom:-20,left:`${Math.random()*100}%`,width:4+Math.random()*8,height:4+Math.random()*8,borderRadius:"50%",background:`rgba(56,189,248,${.03+Math.random()*.05})`,animation:`bubbleRise ${10+Math.random()*14}s linear infinite`,animationDelay:`${Math.random()*10}s`}}/>)}</div>;

  // ═══ LANDING ═══
  if(!connected) return (
    <div style={{minHeight:"100vh",background:"#030712",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",fontFamily:F}}>
      <style>{css}</style><Bubbles/>
      <div style={{position:"relative",zIndex:1,textAlign:"center",animation:"slideUp .8s ease"}}>
        <div style={{animation:"float 4s ease-in-out infinite",marginBottom:16,fontSize:64}}>{"\u{1F433}"}</div>
        <h1 style={{fontSize:38,fontWeight:800,background:"linear-gradient(135deg,#38bdf8,#818cf8,#38bdf8)",backgroundSize:"200%",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"shimmer 3s linear infinite",letterSpacing:-1}}>WHALEMON</h1>
        <div style={{fontSize:11,color:"#64748b",letterSpacing:6,textTransform:"uppercase",marginBottom:32}}>Trading Card Game</div>
        <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:32,flexWrap:"wrap"}}>{ELEMENTS.map((e,i)=><Tag key={i} color={e.color}>{e.icon} {e.name}</Tag>)}</div>
        <Btn onClick={handleConnect} style={{padding:"14px 44px",fontSize:13,letterSpacing:1,boxShadow:"0 4px 28px rgba(14,165,233,.3)"}}>Connect Wallet</Btn>
        <div style={{marginTop:8,fontSize:9,color:"#475569"}}>Tempo Network · Gas in PATHUSD</div>
        <div style={{marginTop:44,display:"flex",gap:24,justifyContent:"center"}}>{[["3,333","Whales"],["6","Elements"],["\u221E","Battles"]].map(([v,l],i)=><div key={i} style={{textAlign:"center"}}><div style={{fontSize:24,fontWeight:800,color:"#e2e8f0"}}>{v}</div><div style={{fontSize:8,color:"#64748b",textTransform:"uppercase",letterSpacing:2}}>{l}</div></div>)}</div>
      </div>
    </div>
  );

  // ═══ CONNECTED ═══
  const Nav = ({l,ic,id}) => <button onClick={()=>{setPage(id);setSelectedCard(null)}} style={{padding:"8px 14px",borderRadius:7,border:page===id?"1px solid #0ea5e922":"1px solid transparent",background:page===id?"#0ea5e90d":"transparent",color:page===id?"#38bdf8":"#64748b",fontFamily:F,fontSize:10,fontWeight:page===id?700:500,cursor:"pointer",display:"flex",alignItems:"center",gap:5,transition:"all .15s"}}><span style={{fontSize:13}}>{ic}</span>{l}</button>;
  const logColor = tp => tp?.includes("win")?"#4ade80":tp?.includes("lose")?"#f87171":tp?.startsWith("p")?"#38bdf8":tp?.startsWith("o")?"#f59e0b":"#94a3b8";

  return (
    <div style={{minHeight:"100vh",background:"#030712",fontFamily:F,position:"relative"}}>
      <style>{css}</style><Bubbles/>
      {notif&&<div style={{position:"fixed",top:14,right:14,zIndex:1000,padding:"9px 16px",borderRadius:7,background:notif.t==="info"?"#1e3a5f":"#064e3b",border:`1px solid ${notif.t==="info"?"#0ea5e922":"#4ade8022"}`,color:"#e2e8f0",fontSize:10,fontFamily:F,animation:"notifSlide .25s",boxShadow:"0 4px 20px rgba(0,0,0,.4)",maxWidth:300}}>{notif.m}</div>}

      {/* Reveal */}
      {revealPhase&&<div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(3,7,18,.93)",backdropFilter:"blur(14px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeIn .3s"}}>
        {revealPhase==="done"&&<button onClick={()=>{setRevealCard(null);setRevealPhase(null)}} style={{position:"absolute",top:14,right:14,background:"none",border:"1px solid #334155",borderRadius:5,color:"#94a3b8",padding:"5px 12px",cursor:"pointer",fontFamily:F,fontSize:9}}>Close</button>}
        {(revealPhase==="minting"||revealPhase==="generating")&&<div style={{textAlign:"center",animation:"slideUp .4s"}}>
          <div style={{width:90,height:90,borderRadius:"50%",background:"#0ea5e908",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",position:"relative"}}><div style={{position:"absolute",inset:-2,border:"2px solid transparent",borderTop:"2px solid #0ea5e9",borderRadius:"50%",animation:"spin 1.5s linear infinite"}}/><span style={{fontSize:36}}>{"\u{1F433}"}</span></div>
          <div style={{fontSize:15,fontWeight:800,color:"#e2e8f0"}}>{revealPhase==="minting"?"Minting on Tempo...":"AI Generating Stats..."}</div>
          <div style={{fontSize:9,color:"#64748b",marginTop:3}}>{revealPhase==="minting"?"PATHUSD gas":"Analyzing traits"}</div>
        </div>}
        {(revealPhase==="revealing"||revealPhase==="done")&&revealCard&&<div style={{textAlign:"center"}}>
          <div style={{animation:"cardFlip .7s ease-out,revealGlow 1s ease-out",borderRadius:12}}><GameCard card={revealCard} size="large"/></div>
          {revealPhase==="done"&&<div style={{marginTop:14}}>
            <div style={{fontSize:16,fontWeight:800,color:ELEMENTS[revealCard.element].color,animation:"textReveal .4s ease .2s both"}}>{ELEMENTS[revealCard.element].icon} {ELEMENTS[revealCard.element].name} {RARITIES[revealCard.rarity]}!</div>
            <Btn onClick={()=>{setRevealCard(null);setRevealPhase(null);setPage("cards")}} style={{marginTop:12,animation:"textReveal .4s ease .5s both"}}>View Cards {"\u2192"}</Btn>
          </div>}
        </div>}
      </div>}

      {/* List Modal */}
      {showList&&<div style={{position:"fixed",inset:0,zIndex:800,background:"rgba(3,7,18,.9)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn .2s"}}>
        <div className="wm-modal" style={{background:"#0f172a",borderRadius:14,border:"1px solid #1e293b",padding:20,width:440,maxWidth:"calc(100vw - 32px)",maxHeight:"80vh",overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><span style={{fontSize:14,fontWeight:800,color:"#e2e8f0"}}>List Cards for Sale</span><button onClick={()=>setShowList(false)} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:14}}>{"\u2715"}</button></div>
          <div style={{marginBottom:10}}><span style={{fontSize:9,color:"#64748b"}}>Bulk price (all selected):</span><input type="number" value={bulkPrice} onChange={e=>setBulkPrice(e.target.value)} placeholder="0.00" style={{width:"100%",marginTop:3,padding:"7px 10px",borderRadius:6,background:"#0a0e27",border:"1px solid #1e293b",color:"#e2e8f0",fontFamily:F,fontSize:11,outline:"none"}}/><span style={{fontSize:7,color:"#475569"}}>PATHUSD — or set individual prices below</span></div>
          {ALL_CARDS.filter(c=>!c.listed).map(c=>{const s=bulkIds.has(c.id);return<div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 8px",borderRadius:6,background:s?"#0ea5e906":"#0a0e27",border:`1px solid ${s?"#0ea5e925":"#1e293b"}`,cursor:"pointer",marginBottom:4}} onClick={()=>{const n=new Set(bulkIds);n.has(c.id)?n.delete(c.id):n.add(c.id);setBulkIds(n)}}>
            <div style={{width:14,height:14,borderRadius:3,border:`2px solid ${s?"#0ea5e9":"#334155"}`,background:s?"#0ea5e9":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"white",flexShrink:0}}>{s?"\u2713":""}</div>
            <div style={{width:32,height:32,borderRadius:5,overflow:"hidden",flexShrink:0}}><CardImg src={c.image} el={c.element} h={32}/></div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:10,fontWeight:700,color:"#e2e8f0"}}>#{c.id}</div><div style={{fontSize:7,color:ELEMENTS[c.element].color}}>{ELEMENTS[c.element].icon} {RARITIES[c.rarity]}</div></div>
            <input type="number" value={listPrices[c.id]||""} onChange={e=>{e.stopPropagation();setListPrices({...listPrices,[c.id]:e.target.value})}} onClick={e=>e.stopPropagation()} placeholder={bulkPrice||"Price"} style={{width:70,padding:"3px 6px",borderRadius:4,background:"#0f172a",border:"1px solid #1e293b",color:"#e2e8f0",fontFamily:F,fontSize:9,outline:"none",textAlign:"right"}}/>
          </div>})}
          <div style={{display:"flex",gap:6,marginTop:12}}><Btn onClick={()=>{notify(`Listed ${bulkIds.size} card(s)!`);setShowList(false);setBulkIds(new Set())}} disabled={bulkIds.size===0} style={{flex:1}}>List {bulkIds.size} Card{bulkIds.size!==1?"s":""}</Btn><Btn onClick={()=>setShowList(false)} bg="#1e293b" style={{border:"1px solid #334155",color:"#94a3b8"}}>Cancel</Btn></div>
        </div>
      </div>}

      {/* Offer Modal */}
      {showOffer&&<div style={{position:"fixed",inset:0,zIndex:800,background:"rgba(3,7,18,.9)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn .2s"}}>
        <div className="wm-modal-sm" style={{background:"#0f172a",borderRadius:14,border:"1px solid #1e293b",padding:20,width:340,maxWidth:"calc(100vw - 32px)"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><span style={{fontSize:14,fontWeight:800,color:"#e2e8f0"}}>{offerTarget==="collection"?"Collection Offer":`Offer on #${offerTarget?.id}`}</span><button onClick={()=>{setShowOffer(false);setOfferTarget(null)}} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:14}}>{"\u2715"}</button></div>
          {offerTarget!=="collection"&&offerTarget&&<div style={{display:"flex",gap:8,marginBottom:12,padding:8,borderRadius:6,background:"#0a0e27",border:"1px solid #1e293b"}}>
            <div style={{width:40,height:40,borderRadius:6,overflow:"hidden"}}><CardImg src={offerTarget.image} el={offerTarget.element} h={40}/></div>
            <div><div style={{fontSize:11,fontWeight:700,color:"#e2e8f0"}}>#{offerTarget.id}</div><div style={{fontSize:8,color:ELEMENTS[offerTarget.element].color}}>{ELEMENTS[offerTarget.element].icon} {RARITIES[offerTarget.rarity]}</div></div>
          </div>}
          <div style={{marginBottom:12}}><span style={{fontSize:9,color:"#64748b"}}>Offer (PATHUSD):</span><input type="number" value={offerAmt} onChange={e=>setOfferAmt(e.target.value)} placeholder="0.00" style={{width:"100%",marginTop:3,padding:"9px 10px",borderRadius:6,background:"#0a0e27",border:"1px solid #1e293b",color:"#e2e8f0",fontFamily:F,fontSize:13,outline:"none"}}/><span style={{fontSize:7,color:"#475569"}}>Balance: {walletBalance} PATHUSD</span></div>
          <div style={{display:"flex",gap:6}}><Btn onClick={()=>{notify(`Offer $${offerAmt} placed on ${offerTarget==="collection"?"collection":`#${offerTarget?.id}`}`);setShowOffer(false);setOfferAmt("");setOfferTarget(null)}} disabled={!offerAmt} style={{flex:1}}>Place Offer</Btn><Btn onClick={()=>{setShowOffer(false);setOfferTarget(null)}} bg="#1e293b" style={{border:"1px solid #334155",color:"#94a3b8"}}>Cancel</Btn></div>
        </div>
      </div>}

      {/* Header */}
      <header style={{position:"relative",zIndex:10,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #0ea5e907",background:"rgba(3,7,18,.85)",backdropFilter:"blur(10px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>{"\u{1F433}"}</span><span style={{fontSize:13,fontWeight:800,color:"#e2e8f0"}}>WHALEMON</span><span style={{fontSize:7,color:"#0ea5e9",letterSpacing:2}}>TCG</span></div>
        <div className="wm-header-info" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{padding:"4px 8px",borderRadius:5,background:"#0ea5e907",border:"1px solid #0ea5e915",fontSize:8,color:"#38bdf8",display:"flex",alignItems:"center",gap:4}}><div style={{width:4,height:4,borderRadius:"50%",background:"#4ade80"}}/>Tempo</div>
          <div style={{padding:"4px 8px",borderRadius:5,background:"#111827",border:"1px solid #1e293b",fontSize:10,color:"#4ade80",fontWeight:700}}>${walletBalance} <span style={{color:"#475569",fontWeight:400}}>USD</span></div>
          <div style={{padding:"4px 8px",borderRadius:5,background:"#111827",border:"1px solid #1e293b",fontSize:9,color:"#e2e8f0",display:"none"}} className="wm-addr-full">{walletAddr}</div>
          <div style={{padding:"4px 8px",borderRadius:5,background:"#111827",border:"1px solid #1e293b",fontSize:9,color:"#e2e8f0"}}>{walletAddr}</div>
          <button onClick={handleDisconnect} style={{padding:"4px 8px",borderRadius:5,background:"transparent",border:"1px solid #dc262628",fontSize:8,color:"#f87171",cursor:"pointer",fontFamily:F}}>Disconnect</button>
        </div>
      </header>

      <nav style={{position:"relative",zIndex:10,padding:"6px 18px",display:"flex",gap:2,borderBottom:"1px solid #0ea5e905",background:"rgba(3,7,18,.5)",overflowX:"auto"}}>
        <Nav l="My Whales" ic={"\u{1F433}"} id="whales"/><Nav l="My Cards" ic={"\u{1F0CF}"} id="cards"/><Nav l="Battle" ic={"\u2694\uFE0F"} id="battle"/><Nav l="Marketplace" ic={"\u{1F3EA}"} id="market"/><Nav l="Leaderboard" ic={"\u{1F3C6}"} id="leaderboard"/>
      </nav>

      <main style={{position:"relative",zIndex:10,padding:18,maxWidth:1180,margin:"0 auto",animation:"fadeIn .3s"}}>

        {/* WHALES */}
        {page==="whales"&&<div><h2 style={{fontSize:18,fontWeight:800,color:"#e2e8f0",marginBottom:3}}>My Whales</h2><p style={{fontSize:10,color:"#64748b",marginBottom:14}}>Generate a Whalemon card from each WHEL NFT — free, one per whale.</p>
        <div className="wm-cards-grid" style={{display:"flex",flexWrap:"wrap",gap:12}}>{MOCK_WHALES.map(w=><div key={w.id} style={{width:180,maxWidth:"calc(50% - 8px)",minWidth:150,borderRadius:10,background:"#0f172a",border:"1px solid #1e293b",overflow:"hidden",transition:"all .2s",position:"relative"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}>
          <CardImg src={w.image} el={0} h={150}/>
          <div style={{position:"absolute",top:5,left:5,padding:"2px 6px",borderRadius:4,background:"rgba(0,0,0,.6)",fontSize:9,color:"#e2e8f0",fontWeight:700}}>#{w.id}</div>
          <div style={{padding:8}}><div style={{fontSize:7,color:"#64748b",marginBottom:5}}>{Object.values(w.traits).join(" \u00B7 ")}</div>
          {mintedIds.has(w.id)?<div style={{padding:"5px 0",borderRadius:5,background:"#065f460d",border:"1px solid #065f4620",textAlign:"center",fontSize:9,color:"#4ade80"}}>{"\u2713"} Card Minted</div>
          :<Btn small onClick={()=>handleMint(w.id)} style={{width:"100%"}}>{"\u26A1"} Generate Card</Btn>}</div>
          {minting===w.id&&<div style={{position:"absolute",inset:0,background:"rgba(3,7,18,.85)",borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}><div style={{width:24,height:24,border:"2px solid #0ea5e928",borderTop:"2px solid #0ea5e9",borderRadius:"50%",animation:"spin 1s linear infinite"}}/><span style={{fontSize:8,color:"#38bdf8"}}>Minting...</span></div>}
        </div>)}</div></div>}

        {/* CARDS */}
        {page==="cards"&&<div><h2 style={{fontSize:18,fontWeight:800,color:"#e2e8f0",marginBottom:3}}>My Cards</h2><p style={{fontSize:10,color:"#64748b",marginBottom:14}}>Your battle-ready cards. Click to inspect.</p>
        <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:12,flex:1}}>{ALL_CARDS.filter(c=>!c.listed).map(c=><GameCard key={c.id} card={c} onClick={()=>setSelectedCard(c)}/>)}</div>
          {selectedCard&&<div style={{width:300,maxWidth:"100%",flexShrink:0,position:"sticky",top:18,alignSelf:"flex-start",animation:"slideUp .3s"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:11,color:"#94a3b8",fontWeight:700}}>Details</span><button onClick={()=>setSelectedCard(null)} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:14}}>{"\u2715"}</button></div>
            <GameCard card={selectedCard} size="large"/>
            <div style={{marginTop:8,padding:10,borderRadius:8,background:"#0f172a",border:"1px solid #1e293b"}}><div style={{fontSize:8,color:"#64748b"}}>TOTAL POWER</div><div style={{fontSize:20,fontWeight:800,color:"#e2e8f0"}}>{selectedCard.attack+selectedCard.defense+Math.floor(selectedCard.health/3)+selectedCard.speed}</div></div>
          </div>}
        </div></div>}

        {/* BATTLE */}
        {page==="battle"&&<div>
          {!battleState&&<div style={{textAlign:"center",paddingTop:28,animation:"slideUp .4s"}}>
            <div style={{fontSize:50,marginBottom:14}}>{"\u2694\uFE0F"}</div><h2 style={{fontSize:18,fontWeight:800,color:"#e2e8f0",marginBottom:5}}>Battle Arena</h2>
            <p style={{fontSize:10,color:"#64748b",maxWidth:380,margin:"0 auto 18px"}}>Ranked matches charge 1 PATHUSD entry to the seasonal prize pool.</p>
            <div style={{maxWidth:440,margin:"0 auto 20px",padding:"12px 18px",borderRadius:10,background:"#0ea5e905",border:"1px solid #0ea5e915",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:7,color:"#64748b",textTransform:"uppercase",letterSpacing:1}}>Season 1 Pool</div><div style={{fontSize:20,fontWeight:800,color:"#4ade80"}}>$847.50</div></div>
              <div style={{display:"flex",gap:4}}>{["\u{1F947} 40%","\u{1F948} 25%","\u{1F949} 15%","4th 12%","5th 8%"].map((t,i)=><div key={i} style={{padding:"2px 7px",borderRadius:4,background:"#0f172a",border:"1px solid #1e293b",fontSize:7,color:"#94a3b8"}}>{t}</div>)}</div>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
              {[{m:"free",ic:"\u{1F3AF}",t:"Practice",d:"vs AI \u00B7 Free",bc:"#22c55e30",hc:"#22c55e"},{m:"ranked-ai",ic:"\u{1F916}",t:"Ranked AI",d:"vs AI \u00B7 1 PATHUSD",bc:"#0ea5e930",hc:"#0ea5e9"},{m:"pvp",ic:"\u{1F465}",t:"Ranked PvP",d:"vs Player \u00B7 1 PATHUSD",bc:"#8b5cf630",hc:"#8b5cf6"}].map(x=><button key={x.m} onClick={()=>startBattle(x.m)} style={{padding:"18px 24px",borderRadius:10,background:"#0f172a",border:`1px solid ${x.bc}`,width:165,maxWidth:"calc(33% - 8px)",minWidth:140,flex:"1 1 140px",cursor:"pointer",textAlign:"center",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=x.hc;e.currentTarget.style.transform="translateY(-2px)"}} onMouseLeave={e=>{e.currentTarget.style.borderColor=x.bc;e.currentTarget.style.transform="none"}}>
                <div style={{fontSize:22,marginBottom:4}}>{x.ic}</div><div style={{fontSize:11,fontWeight:700,color:"#e2e8f0",fontFamily:F}}>{x.t}</div><div style={{fontSize:8,color:"#64748b",fontFamily:F,marginTop:1}}>{x.d}</div>
              </button>)}
            </div>
          </div>}
          {battleState==="select"&&<div style={{animation:"slideUp .3s"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div><h2 style={{fontSize:16,fontWeight:800,color:"#e2e8f0"}}>Choose Your Whalemon</h2><p style={{fontSize:9,color:"#64748b"}}>{battleMode==="free"?"Practice (free)":"Ranked (1 PATHUSD)"}</p></div><Btn small onClick={exitBattle} bg="#1e293b" style={{border:"1px solid #334155",color:"#94a3b8"}}>{"\u2190"} Back</Btn></div>
            <div style={{display:"flex",flexWrap:"wrap",gap:12}}>{ALL_CARDS.filter(c=>!c.listed).map(c=><GameCard key={c.id} card={c} onClick={()=>pickCard(c)}/>)}</div></div>}
          {battleState==="fighting"&&pCard&&oCard&&<div style={{animation:"fadeIn .3s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><span style={{fontSize:10,color:"#64748b"}}>Turn {bTurn} \u00B7 {battleMode==="free"?"Practice":battleMode==="ranked-ai"?"Ranked AI":"PvP"}</span><Btn small onClick={exitBattle} bg="#1e293b" style={{border:"1px solid #334155",color:"#94a3b8"}}>{bResult?"Exit":"Forfeit"}</Btn></div>
            <div className="wm-battle-field" style={{display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap"}}>
              {[{lbl:"YOUR WHALEMON",c:pCard,clr:"#4ade80"},null,{lbl:battleMode==="pvp"?"OPPONENT":"AI",c:oCard,clr:"#f87171"}].map((s,i)=>{
                if(!s) return <div key={i} style={{display:"flex",alignItems:"center"}}><div style={{fontSize:22,fontWeight:800,color:"#1e293b"}}>VS</div></div>;
                const cc=s.c,hp=Math.max(0,cc.currentHp??cc.health),pct=hp/cc.health;
                return <div key={i} style={{flex:"1 1 250px",maxWidth:300}}>
                  <div style={{textAlign:"center",marginBottom:5,fontSize:9,color:s.clr,fontWeight:700}}>{s.lbl}</div>
                  <div style={{background:"#0f172a",borderRadius:10,border:`1px solid ${ELEMENTS[cc.element].color}20`,padding:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:11,fontWeight:700,color:"#e2e8f0"}}>#{cc.id}</span><span style={{fontSize:8,color:ELEMENTS[cc.element].color}}>{ELEMENTS[cc.element].icon} {ELEMENTS[cc.element].name}</span></div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <div style={{width:40,height:40,borderRadius:6,overflow:"hidden"}}><CardImg src={cc.image} el={cc.element} h={40}/></div>
                      <div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#94a3b8",marginBottom:2}}><span>HP</span><span>{hp}/{cc.health}</span></div>
                      <div style={{height:7,background:"#1e293b",borderRadius:3,overflow:"hidden"}}><div style={{width:`${pct*100}%`,height:"100%",background:pct>.5?"#4ade80":pct>.2?"#facc15":"#f87171",borderRadius:3,transition:"all .4s"}}/></div></div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:2}}><StatMini l="ATK" v={cc.attack} c="#f87171"/><StatMini l="DEF" v={cc.defense} c="#60a5fa"/><StatMini l="SPD" v={cc.speed} c="#facc15"/><StatMini l="RAR" v={RARITIES[cc.rarity]?.[0]} c={RARITY_COLORS[cc.rarity]}/></div>
                  </div>
                </div>;
              })}
            </div>
            {adv(pCard.element,oCard.element)&&<div style={{textAlign:"center",marginTop:6,fontSize:9,color:"#4ade80"}}>{"\u26A1"} Element advantage!</div>}
            {adv(oCard.element,pCard.element)&&<div style={{textAlign:"center",marginTop:6,fontSize:9,color:"#f87171"}}>{"\u26A0"} Enemy has advantage!</div>}
            {!bResult&&<div style={{display:"flex",gap:7,justifyContent:"center",marginTop:14}}>
              <Btn onClick={()=>doMove("atk")} bg="linear-gradient(135deg,#dc2626,#b91c1c)">{"\u2694\uFE0F"} Attack</Btn>
              <Btn onClick={()=>doMove("ab")} disabled={abCd>0} bg="linear-gradient(135deg,#8b5cf6,#6d28d9)">{"\u{1F300}"} {pCard.ability}{abCd>0?` (${abCd})`:""}</Btn>
              <Btn onClick={()=>doMove("def")} bg="linear-gradient(135deg,#0ea5e9,#0284c7)">{"\u{1F6E1}\uFE0F"} Defend</Btn>
            </div>}
            {bResult&&<div style={{textAlign:"center",marginTop:16,padding:"14px 24px",borderRadius:10,background:bResult==="win"?"#064e3b":bResult==="lose"?"#450a0a":"#1e293b",border:`1px solid ${bResult==="win"?"#4ade8028":bResult==="lose"?"#f8717128":"#64748b28"}`,animation:"slideUp .3s"}}>
              <div style={{fontSize:26}}>{bResult==="win"?"\u{1F3C6}":bResult==="lose"?"\u{1F480}":"\u{1F91D}"}</div>
              <div style={{fontSize:16,fontWeight:800,color:bResult==="win"?"#4ade80":bResult==="lose"?"#f87171":"#94a3b8",marginTop:3}}>{bResult==="win"?"VICTORY!":bResult==="lose"?"DEFEATED":"DRAW"}</div>
              <div style={{fontSize:8,color:"#64748b",marginTop:4}}>Turn {bTurn} {battleMode!=="free"?"\u00B7 On-chain":"\u00B7 Practice"}</div>
              <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:10}}><Btn small onClick={()=>{exitBattle();startBattle(battleMode)}}>Again</Btn><Btn small onClick={exitBattle} bg="#1e293b" style={{border:"1px solid #334155",color:"#94a3b8"}}>Exit</Btn></div>
            </div>}
            <div style={{marginTop:14,padding:10,borderRadius:8,background:"#0a0e27",border:"1px solid #1e293b",maxHeight:140,overflowY:"auto"}}>
              <div style={{fontSize:7,color:"#475569",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Battle Log</div>
              {bLog.map((l,i)=><div key={i} style={{fontSize:9,padding:"1px 0 1px 5px",color:logColor(l.tp),borderLeft:`2px solid ${logColor(l.tp)}20`}}>{l.txt}</div>)}
            </div>
          </div>}
        </div>}

        {/* MARKETPLACE */}
        {page==="market"&&<div style={{animation:"slideUp .3s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:6}}>
            <div><h2 style={{fontSize:18,fontWeight:800,color:"#e2e8f0"}}>Marketplace</h2><p style={{fontSize:9,color:"#64748b"}}>Trade Whalemon cards in PATHUSD</p></div>
            <div style={{display:"flex",gap:5}}><Btn small onClick={()=>{setOfferTarget("collection");setShowOffer(true)}} bg="#1e293b" style={{border:"1px solid #334155",color:"#94a3b8"}}>Collection Offer</Btn><Btn small onClick={()=>setShowList(true)}>+ List Cards</Btn></div>
          </div>
          {/* Stats */}
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            {[{l:"Floor",v:"8.00",c:"#4ade80"},{l:"24h Vol",v:"1,847",c:"#38bdf8"},{l:"Listed",v:ALL_CARDS.filter(c=>c.listed).length,c:"#f59e0b"},{l:"Total Minted",v:ALL_CARDS.length,c:"#a855f7"}].map((s,i)=><div key={i} style={{flex:"1 1 110px",padding:"8px 10px",borderRadius:8,background:"#0f172a",border:"1px solid #1e293b"}}>
              <div style={{fontSize:7,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:1}}>{s.l}</div>
              <div style={{fontSize:15,fontWeight:800,color:s.c}}>{s.v}{typeof s.v==="string"?<span style={{fontSize:8,color:"#475569"}}> USD</span>:""}</div>
            </div>)}
          </div>
          <div className="wm-market-layout" style={{display:"flex",gap:14}}>
            <div className="wm-market-main" style={{flex:1,minWidth:0}}>
              {/* Tabs + sort */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
                <div style={{display:"flex",gap:3}}>{[["listed","Active"],["all","All Items"],["myListings","My Listings"]].map(([k,l])=><Tag key={k} active={mktTab===k} onClick={()=>setMktTab(k)} color="#0ea5e9">{l}</Tag>)}</div>
                <select value={mktSort} onChange={e=>setMktSort(e.target.value)} style={{padding:"3px 6px",borderRadius:5,background:"#0f172a",border:"1px solid #1e293b",color:"#94a3b8",fontFamily:F,fontSize:8,outline:"none"}}>
                  <option value="price-asc">Price: Low{"\u2192"}High</option><option value="price-desc">Price: High{"\u2192"}Low</option>
                  <option value="rarity-desc">Rarity: Legendary{"\u2192"}Common</option><option value="rarity-asc">Rarity: Common{"\u2192"}Legendary</option>
                  <option value="power-desc">Power: Highest</option>
                </select>
              </div>
              {/* Filters */}
              <div style={{display:"flex",gap:3,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:7,color:"#475569"}}>ELEMENT:</span><Tag active={fEl===null} onClick={()=>setFEl(null)} color="#0ea5e9">All</Tag>
                {ELEMENTS.map((e,i)=><Tag key={i} active={fEl===i} onClick={()=>setFEl(fEl===i?null:i)} color={e.color}>{e.icon}</Tag>)}
                <span style={{fontSize:7,color:"#475569",marginLeft:6}}>RARITY:</span><Tag active={fRar===null} onClick={()=>setFRar(null)} color="#0ea5e9">All</Tag>
                {RARITIES.map((r,i)=><Tag key={i} active={fRar===i} onClick={()=>setFRar(fRar===i?null:i)} color={RARITY_COLORS[i]}>{r[0]}</Tag>)}
                <span style={{fontSize:7,color:"#475569",marginLeft:6}}>MIN ATK:</span>
                <input type="number" value={fMinAtk} onChange={e=>setFMinAtk(e.target.value)} placeholder="0" style={{width:40,padding:"2px 5px",borderRadius:4,background:"#0f172a",border:"1px solid #1e293b",color:"#e2e8f0",fontFamily:F,fontSize:8,outline:"none"}}/>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                {getCards().map(c=><MktCard key={c.id} card={c} isOwner={c.seller===walletAddr} onBuy={c=>notify(`Bought #${c.id} for $${c.price}!`)} onCancel={c=>notify(`Cancelled #${c.id}`)} onOffer={c=>{setOfferTarget(c);setShowOffer(true)}}/>)}
                {getCards().length===0&&<div style={{padding:32,textAlign:"center",color:"#475569",fontSize:10,width:"100%"}}>No cards match filters</div>}
              </div>
            </div>
            {/* Sales sidebar */}
            <div className="wm-market-sidebar">
              <div style={{fontSize:9,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Recent Sales</div>
              <div style={{borderRadius:8,background:"#0f172a",border:"1px solid #1e293b",overflow:"hidden"}}>
                {RECENT_SALES.map((s,i)=><div key={i} style={{padding:"8px",borderBottom:"1px solid #0a0e27"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:9,color:ELEMENTS[s.element].color,fontWeight:700}}>{ELEMENTS[s.element].icon}#{s.id}</span><span style={{fontSize:9,color:"#4ade80",fontWeight:700}}>${s.price}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:7}}><span style={{color:"#475569"}}>{s.from}{"\u2192"}{s.to}</span><span style={{color:"#334155"}}>{s.time}</span></div>
                </div>)}
              </div>
            </div>
          </div>
        </div>}

        {/* LEADERBOARD */}
        {page==="leaderboard"&&<div style={{animation:"slideUp .3s"}}>
          <h2 style={{fontSize:18,fontWeight:800,color:"#e2e8f0",marginBottom:3}}>Leaderboard</h2><p style={{fontSize:10,color:"#64748b",marginBottom:14}}>Top Whalemon commanders by wins</p>
          <div style={{padding:"10px 14px",borderRadius:8,marginBottom:14,background:"#0ea5e905",border:"1px solid #0ea5e912",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
            <div><div style={{fontSize:12,fontWeight:800,color:"#e2e8f0"}}>Season 1</div><div style={{fontSize:8,color:"#64748b"}}>Mar-Jun 2026</div></div>
            <div style={{display:"flex",gap:14}}>{[["572","Battles"],["184","Players"],["$847","Pool"]].map(([v,l],i)=><div key={i} style={{textAlign:"center"}}><div style={{fontSize:13,fontWeight:800,color:"#38bdf8"}}>{v}</div><div style={{fontSize:6,color:"#64748b",textTransform:"uppercase",letterSpacing:1}}>{l}</div></div>)}</div>
          </div>
          <div style={{borderRadius:10,background:"#0f172a",border:"1px solid #1e293b",overflow:"hidden"}}>
            <div className="wm-lb-header" style={{display:"grid",gridTemplateColumns:"40px 1fr 60px 60px 60px 60px",padding:"8px 14px",borderBottom:"1px solid #1e293b",fontSize:7,color:"#475569",textTransform:"uppercase",letterSpacing:1}}>
              <span>Rank</span><span>Player</span><span style={{textAlign:"right"}}>Wins</span><span style={{textAlign:"right"}}>Losses</span><span style={{textAlign:"right"}}>Streak</span><span style={{textAlign:"right"}}>Win%</span>
            </div>
            {[{r:1,a:"0x7fA3...b29E",w:142,l:31,s:12,m:"\u{1F947}"},{r:2,a:"0xd8B1...c44F",w:128,l:44,s:8,m:"\u{1F948}"},{r:3,a:"0x92eC...1a7D",w:115,l:52,s:5,m:"\u{1F949}"},{r:4,a:"0xfA01...88eB",w:98,l:67,s:3,m:""},{r:5,a:"0x3c5D...f92A",w:87,l:55,s:7,m:""},{r:6,a:"0xA1b2...3c4D",w:76,l:48,s:4,m:""},{r:7,a:"0xE5f6...7a8B",w:68,l:62,s:1,m:""},{r:8,a:"0x9CdE...fA01",w:55,l:41,s:6,m:""},{r:9,a:"0x2B3c...4D5e",w:49,l:39,s:2,m:""},{r:10,a:"0x6F7a...8B9c",w:42,l:44,s:0,m:""}].map(row=>{
              const wr=Math.round(row.w/(row.w+row.l)*100);
              return <div key={row.r} className="wm-lb-grid" style={{display:"grid",gridTemplateColumns:"40px 1fr 60px 60px 60px 60px",padding:"10px 14px",borderBottom:"1px solid #0a0e27",fontSize:10,alignItems:"center",background:row.r<=3?`rgba(14,165,233,${.04-row.r*.01})`:"transparent"}}>
                <span style={{fontWeight:700,fontSize:row.m?13:10}}>{row.m||`#${row.r}`}</span>
                <span style={{color:row.r<=3?"#38bdf8":"#94a3b8"}}>{row.a}</span>
                <span style={{textAlign:"right",color:"#4ade80",fontWeight:700}}>{row.w}</span>
                <span style={{textAlign:"right",color:"#f87171"}}>{row.l}</span>
                <span style={{textAlign:"right",color:row.s>=5?"#f59e0b":"#64748b"}}>{row.s>0?`\u{1F525}${row.s}`:"-"}</span>
                <span style={{textAlign:"right",fontWeight:700,color:wr>=60?"#4ade80":wr>=50?"#facc15":"#f87171"}}>{wr}%</span>
              </div>})}
          </div>
          <div style={{textAlign:"center",marginTop:10,fontSize:8,color:"#334155"}}>BattleArena on Tempo (4217)</div>
        </div>}

      </main>
      <footer style={{position:"relative",zIndex:10,padding:"14px 18px",marginTop:28,borderTop:"1px solid #0ea5e905",display:"flex",justifyContent:"space-between",fontSize:8,color:"#1e293b"}}><span>Whalemon TCG</span><span>Tempo \u00B7 PATHUSD \u00B7 4217</span></footer>
    </div>
  );
}
