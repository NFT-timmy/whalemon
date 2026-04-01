import { useState, useEffect, useRef } from "react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";

// WHALEMON TCG — Blockchain Connected Frontend
const TEMPO_CHAIN_ID = "0x1079"; // 4217
const CONTRACTS = {
  WHEL_NFT: "0x3e12fcb20ad532f653f2907d2ae511364e2ae696",
  WHALE_CARDS: "0xf482221cf5150868956D80cdE00F589dC227D78A",
  BATTLE_ARENA: "0x7C220371C08285dBc06C641EC42552A57A85215A",
  MARKETPLACE: "0xF66E45889adDc6e330B38C0727567f2608EEC475",
  PATHUSD: "0x20c0000000000000000000000000000000000000",
};

const WHEL_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
];
const WHALE_CARDS_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function getCard(uint256 tokenId) view returns (uint8 element, uint8 rarity, uint16 attack, uint16 defense, uint16 health, uint16 speed, string ability, string abilityDesc)",
  "function hasMinted(uint256 whaleId) view returns (bool)",
  "function mintCard(uint256 whaleId) external",
];
const PATHUSD_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const ELEMENTS = [
  { name: "Abyss", color: "#6d28d9", icon: "🌊", bg: "linear-gradient(135deg, #1a0a2e, #2d1b69)" },
  { name: "Tide", color: "#0ea5e9", icon: "🌀", bg: "linear-gradient(135deg, #0c4a6e, #0ea5e9)" },
  { name: "Storm", color: "#8b5cf6", icon: "⚡", bg: "linear-gradient(135deg, #2e1065, #7c3aed)" },
  { name: "Frost", color: "#67e8f9", icon: "❄️", bg: "linear-gradient(135deg, #083344, #22d3ee)" },
  { name: "Coral", color: "#f472b6", icon: "🪸", bg: "linear-gradient(135deg, #500724, #ec4899)" },
  { name: "Leviathan", color: "#dc2626", icon: "🔥", bg: "linear-gradient(135deg, #450a0a, #dc2626)" },
];
const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
const RARITY_COLORS = ["#94a3b8", "#22c55e", "#3b82f6", "#a855f7", "#f59e0b"];
const F = "'JetBrains Mono', monospace";
const nftImg = (id, bg = "0c4a6e", fg = "38bdf8") => `https://placehold.co/400x400/${bg}/${fg}?text=WHEL+%23${id}`;

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
    <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${(value / max) * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.5s" }} /></div>
    <span style={{ width: 22, fontSize: 10, color: "#e2e8f0", fontFamily: F, textAlign: "right", fontWeight: 700 }}>{value}</span>
  </div>
);
const CardImg = ({ src, el, h = 130 }) => (
  <div style={{ height: h, background: ELEMENTS[el]?.bg || "#0f172a", overflow: "hidden", position: "relative" }}>
    {src && <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
    {!src && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}><span style={{ fontSize: h > 100 ? 44 : 28 }}>🐋</span></div>}
  </div>
);

function GameCard({ card, size = "normal", onClick }) {
  const el = ELEMENTS[card.element] || ELEMENTS[0]; const lg = size === "large"; const w = lg ? 290 : 200; const h = lg ? 400 : 285;
  return (
    <div onClick={onClick} style={{ width: w, maxWidth: "100%", height: h, borderRadius: 12, background: "#0a0e27", border: `2px solid ${el.color}35`, boxShadow: `0 0 20px ${el.color}10`, cursor: onClick ? "pointer" : "default", overflow: "hidden", transition: "all 0.2s", flexShrink: 0, position: "relative" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 6px 30px ${el.color}20`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = `0 0 20px ${el.color}10`; }}>
      <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 2, background: RARITY_COLORS[card.rarity] || RARITY_COLORS[0], opacity: 0.6, borderRadius: "0 0 3px 3px" }} />
      <div style={{ padding: lg ? "10px 12px 4px" : "6px 8px 3px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: F, fontSize: lg ? 12 : 9, color: "#e2e8f0", fontWeight: 700 }}>#{card.id}</span>
        <span style={{ fontFamily: F, fontSize: lg ? 9 : 7, color: el.color }}>{el.icon} {el.name}</span>
      </div>
      <div style={{ margin: lg ? "0 10px" : "0 6px", borderRadius: 7, overflow: "hidden" }}><CardImg src={card.image} el={card.element} h={lg ? 155 : 100} /></div>
      <div style={{ padding: lg ? "6px 12px 2px" : "4px 8px 1px" }}>
        <div style={{ fontFamily: F, fontSize: lg ? 11 : 8, color: "#e2e8f0", fontWeight: 700 }}>Whalemon #{card.id}</div>
        <div style={{ fontFamily: F, fontSize: lg ? 8 : 6, color: RARITY_COLORS[card.rarity] || RARITY_COLORS[0], textTransform: "uppercase", letterSpacing: 1.5, marginTop: 1 }}>★ {RARITIES[card.rarity] || "Common"}</div>
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

export default function WhalemonTCG() {
  const [connected, setConnected] = useState(false);
  const [walletAddr, setWalletAddr] = useState("");
  const [walletBalance, setWalletBalance] = useState("0.00");
  const [page, setPage] = useState("whales");
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
  const [showOffer, setShowOffer] = useState(false);
  const [offerTarget, setOfferTarget] = useState(null);
  const [offerAmt, setOfferAmt] = useState("");

  // Real blockchain state
  const [myWhales, setMyWhales] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [mintedIds, setMintedIds] = useState(new Set());
  const [loadingWhales, setLoadingWhales] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [provider, setProvider] = useState(null);

  const notify = (m, t = "success") => { setNotif({ m, t }); setTimeout(() => setNotif(null), 3500); };

  // Load balance and NFTs after connect
  useEffect(() => {
    if (!connected || !walletAddr || !provider) return;
    loadBalance();
    loadWhales();
    loadCards();
  }, [connected, walletAddr, provider]);

  const loadBalance = async () => {
    try {
      const pathusd = new Contract(CONTRACTS.PATHUSD, PATHUSD_ABI, provider);
      const bal = await pathusd.balanceOf(walletAddr);
      const dec = await pathusd.decimals();
      const formatted = (Number(bal) / Math.pow(10, Number(dec))).toFixed(2);
      setWalletBalance(formatted);
    } catch (e) {
      console.log("Balance error:", e);
      // fallback: try native balance
      try {
        const bal = await provider.getBalance(walletAddr);
        setWalletBalance(parseFloat(formatEther(bal)).toFixed(2));
      } catch (e2) { console.log("Native balance error:", e2); }
    }
  };

  const loadWhales = async () => {
    setLoadingWhales(true);
    try {
      const whel = new Contract(CONTRACTS.WHEL_NFT, WHEL_ABI, provider);
      const whaleCards = new Contract(CONTRACTS.WHALE_CARDS, WHALE_CARDS_ABI, provider);
      const bal = await whel.balanceOf(walletAddr);
      const count = Number(bal);
      const whales = [];
      const minted = new Set();
      for (let i = 0; i < count; i++) {
        try {
          const tokenId = await whel.tokenOfOwnerByIndex(walletAddr, i);
          const id = Number(tokenId);
          const hasMinted = await whaleCards.hasMinted(id);
          if (hasMinted) minted.add(id);
          whales.push({ id, image: nftImg(id), traits: {} });
        } catch (e) { console.log("Whale load error:", e); }
      }
      setMyWhales(whales);
      setMintedIds(minted);
    } catch (e) {
      console.log("Load whales error:", e);
      notify("Could not load WHEL NFTs", "error");
    }
    setLoadingWhales(false);
  };

  const loadCards = async () => {
    setLoadingCards(true);
    try {
      const whaleCards = new Contract(CONTRACTS.WHALE_CARDS, WHALE_CARDS_ABI, provider);
      const bal = await whaleCards.balanceOf(walletAddr);
      const count = Number(bal);
      const cards = [];
      for (let i = 0; i < count; i++) {
        try {
          const tokenId = await whaleCards.tokenOfOwnerByIndex(walletAddr, i);
          const id = Number(tokenId);
          const card = await whaleCards.getCard(id);
          cards.push({
            id,
            image: nftImg(id),
            element: Number(card.element),
            rarity: Number(card.rarity),
            attack: Number(card.attack),
            defense: Number(card.defense),
            health: Number(card.health),
            speed: Number(card.speed),
            ability: card.ability || "Ocean Strike",
            abilityDesc: card.abilityDesc || "A powerful ocean attack.",
            listed: false,
          });
        } catch (e) { console.log("Card load error:", e); }
      }
      setMyCards(cards);
    } catch (e) {
      console.log("Load cards error:", e);
      notify("Could not load cards", "error");
    }
    setLoadingCards(false);
  };

  const handleConnect = async () => {
    try {
      if (!window.ethereum) { alert("Please install MetaMask!"); return; }
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) return;
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: TEMPO_CHAIN_ID, chainName: "Tempo Network", rpcUrls: ["https://rpc.tempo.xyz"], nativeCurrency: { name: "PATHUSD", symbol: "PATHUSD", decimals: 18 }, blockExplorerUrls: ["https://explore.tempo.xyz"] }]
        });
      } catch (chainErr) { console.log("Chain error:", chainErr); }
      const prov = new BrowserProvider(window.ethereum);
      setProvider(prov);
      setWalletAddr(accounts[0]);
      setConnected(true);
      notify("Connected to Tempo! Loading your NFTs...");
    } catch (e) { alert("Connection failed: " + e.message); }
  };

  const handleDisconnect = () => {
    setConnected(false); setWalletAddr(""); setWalletBalance("0.00");
    setMyWhales([]); setMyCards([]); setMintedIds(new Set());
    setPage("whales"); notify("Disconnected", "info");
  };

  const handleMint = async (whaleId) => {
    if (!provider) return;
    setMinting(whaleId); setRevealPhase("minting");
    try {
      const signer = await provider.getSigner();
      const whaleCards = new Contract(CONTRACTS.WHALE_CARDS, WHALE_CARDS_ABI, signer);
      const tx = await whaleCards.mintCard(whaleId);
      notify("Transaction submitted! Waiting for confirmation...");
      setRevealPhase("generating");
      await tx.wait();
      notify("Card minted! Loading stats...");
      // Wait for oracle to generate stats
      await new Promise(r => setTimeout(r, 4000));
      // Reload cards
      await loadCards();
      await loadBalance();
      const newCards = myCards;
      const newCard = newCards.find(c => c.id === whaleId) || {
        id: whaleId, image: nftImg(whaleId), element: Math.floor(Math.random() * 6),
        rarity: [0, 0, 0, 1, 1, 2, 2, 3, 4][Math.floor(Math.random() * 9)],
        attack: 30 + Math.floor(Math.random() * 60), defense: 30 + Math.floor(Math.random() * 60),
        health: 100 + Math.floor(Math.random() * 180), speed: 30 + Math.floor(Math.random() * 60),
        ability: "Ocean Strike", abilityDesc: "A powerful ocean attack."
      };
      setMintedIds(p => new Set([...p, whaleId]));
      setRevealCard(newCard); setRevealPhase("revealing");
      await new Promise(r => setTimeout(r, 600)); setRevealPhase("done");
    } catch (e) {
      console.log("Mint error:", e);
      notify("Mint failed: " + (e.reason || e.message || "Unknown error"), "error");
      setRevealPhase(null);
    }
    setMinting(null);
  };

  // Battle logic
  const startBattle = m => { setBattleMode(m); setBattleState("select"); setBLog([]); setBTurn(1); setAbCd(0); setBResult(null); setPCard(null); setOCard(null); };
  const pickCard = c => {
    setPCard({ ...c, currentHp: c.health });
    const el = Math.floor(Math.random() * 6), r = [0, 0, 1, 1, 2, 2, 3][Math.floor(Math.random() * 7)], m = [1, 1.1, 1.25, 1.4, 1.6][r];
    const hp = Math.round((100 + Math.random() * 150) * m);
    setOCard({ id: "AI", image: null, element: el, rarity: r, attack: Math.round((30 + Math.random() * 50) * m), defense: Math.round((30 + Math.random() * 50) * m), health: hp, speed: Math.round((30 + Math.random() * 50) * m), ability: ["Void Pulse", "Riptide Slash", "Thunder Breach", "Ice Barb", "Reef Sting", "Crushing Jaw"][el], abilityDesc: "Deep sea attack.", currentHp: hp });
    setBattleState("fighting"); setBLog([{ t: 0, txt: `Battle started! ${battleMode === "free" ? "(Practice)" : "(Ranked - 1 PATHUSD)"}`, tp: "sys" }]);
  };
  const adv = (a, d) => ({ 0: 3, 3: 4, 4: 1, 1: 5, 5: 2, 2: 0 }[a] === d);
  const dmg = (a, d, ab, ad) => Math.max(5, Math.round((a.attack * 100 / (100 + d.defense)) * (ab ? 1.8 : 1) * (ad ? 1.5 : 1) * (0.9 + Math.random() * 0.2)));
  const doMove = async mv => {
    if (!pCard || !oCard || bResult) return; const p = { ...pCard }, o = { ...oCard }, l = [...bLog]; let cd = abCd, t = bTurn;
    const pa = adv(p.element, o.element);
    if (mv === "atk") { const d = dmg(p, o, false, pa); o.currentHp -= d; l.push({ t, txt: `Attack: ${d} dmg!${pa ? " ⚡" : ""}`, tp: "p" }); }
    else if (mv === "ab") { if (cd > 0) return; const d = dmg(p, o, true, pa); o.currentHp -= d; cd = 3; l.push({ t, txt: `${p.ability}: ${d} dmg!${pa ? " ⚡" : ""}`, tp: "pa" }); }
    else { l.push({ t, txt: "Defend! (50% reduction next hit)", tp: "pd" }); }
    if (o.currentHp <= 0) { o.currentHp = 0; l.push({ t, txt: "Enemy defeated! Victory! 🏆", tp: "win" }); setPCard(p); setOCard(o); setBLog(l); setBResult("win"); return; }
    await new Promise(r => setTimeout(r, 600));
    const oa = adv(o.element, p.element), roll = Math.random();
    if (o.currentHp < o.health * .3 && roll < .3) { l.push({ t, txt: "Enemy defends!", tp: "od" }); }
    else if (roll < .35) { let d = dmg(o, p, true, oa); if (mv === "def") d = Math.round(d / 2); p.currentHp -= d; l.push({ t, txt: `Enemy ${o.ability}: ${d} dmg!${oa ? " ⚡" : ""}`, tp: "oa" }); }
    else { let d = dmg(o, p, false, oa); if (mv === "def") d = Math.round(d / 2); p.currentHp -= d; l.push({ t, txt: `Enemy attacks: ${d} dmg!${oa ? " ⚡" : ""}`, tp: "o" }); }
    if (p.currentHp <= 0) { p.currentHp = 0; l.push({ t, txt: "Defeated! 💀", tp: "lose" }); setBResult("lose"); }
    if (t >= 30 && !bResult) { const r = p.currentHp > o.currentHp ? "win" : p.currentHp < o.currentHp ? "lose" : "draw"; l.push({ t, txt: `Max turns! ${r === "win" ? "Win!" : r === "lose" ? "Lose." : "Draw!"}`, tp: "sys" }); setBResult(r); }
    setPCard(p); setOCard(o); setBLog(l); setBTurn(t + 1); setAbCd(Math.max(0, cd - 1));
  };
  const exitBattle = () => { setBattleState(null); setBattleMode(null); setPCard(null); setOCard(null); setBLog([]); setBResult(null); };

  const css = `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap');
@keyframes bubbleRise{0%{transform:translateY(0);opacity:0}10%{opacity:.5}100%{transform:translateY(-100vh);opacity:0}}
@keyframes slideUp{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{0%{opacity:0}100%{opacity:1}}@keyframes spin{to{transform:rotate(360deg)}}
@keyframes notifSlide{0%{transform:translateX(100%);opacity:0}100%{transform:translateX(0);opacity:1}}
@keyframes cardFlip{0%{transform:perspective(800px) rotateY(180deg) scale(.8);opacity:0}50%{transform:perspective(800px) rotateY(90deg) scale(1.05)}100%{transform:perspective(800px) rotateY(0) scale(1);opacity:1}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
.wm-cards-grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.wm-market-layout{display:flex;gap:14px}
.wm-market-main{flex:1;min-width:0}
.wm-lb-grid{display:grid;grid-template-columns:40px 1fr 60px 60px 60px 60px;padding:10px 14px;font-size:10px;align-items:center}
@media(max-width:768px){.wm-market-layout{flex-direction:column}.wm-lb-grid{grid-template-columns:32px 1fr 44px 44px 44px 44px;padding:8px 8px;font-size:9px}}`;

  const Bubbles = () => <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>{Array.from({ length: 12 }).map((_, i) => <div key={i} style={{ position: "absolute", bottom: -20, left: `${Math.random() * 100}%`, width: 4 + Math.random() * 8, height: 4 + Math.random() * 8, borderRadius: "50%", background: `rgba(56,189,248,${.03 + Math.random() * .05})`, animation: `bubbleRise ${10 + Math.random() * 14}s linear infinite`, animationDelay: `${Math.random() * 10}s` }} />)}</div>;

  if (!connected) return (
    <div style={{ minHeight: "100vh", background: "#030712", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", fontFamily: F }}>
      <style>{css}</style><Bubbles />
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", animation: "slideUp .8s ease" }}>
        <div style={{ animation: "float 4s ease-in-out infinite", marginBottom: 16, fontSize: 64 }}>🐋</div>
        <h1 style={{ fontSize: 38, fontWeight: 800, background: "linear-gradient(135deg,#38bdf8,#818cf8,#38bdf8)", backgroundSize: "200%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite", letterSpacing: -1 }}>WHALEMON</h1>
        <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 6, textTransform: "uppercase", marginBottom: 32 }}>Trading Card Game</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 32, flexWrap: "wrap" }}>{ELEMENTS.map((e, i) => <Tag key={i} color={e.color}>{e.icon} {e.name}</Tag>)}</div>
        <Btn onClick={handleConnect} style={{ padding: "14px 44px", fontSize: 13, letterSpacing: 1, boxShadow: "0 4px 28px rgba(14,165,233,.3)" }}>Connect Wallet</Btn>
        <div style={{ marginTop: 8, fontSize: 9, color: "#475569" }}>Tempo Network · Gas in PATHUSD</div>
        <div style={{ marginTop: 44, display: "flex", gap: 24, justifyContent: "center" }}>{[["3,333", "Whales"], ["6", "Elements"], ["∞", "Battles"]].map(([v, l], i) => <div key={i} style={{ textAlign: "center" }}><div style={{ fontSize: 24, fontWeight: 800, color: "#e2e8f0" }}>{v}</div><div style={{ fontSize: 8, color: "#64748b", textTransform: "uppercase", letterSpacing: 2 }}>{l}</div></div>)}</div>
      </div>
    </div>
  );

  const Nav = ({ l, ic, id }) => <button onClick={() => { setPage(id); setSelectedCard(null); }} style={{ padding: "8px 14px", borderRadius: 7, border: page === id ? "1px solid #0ea5e922" : "1px solid transparent", background: page === id ? "#0ea5e90d" : "transparent", color: page === id ? "#38bdf8" : "#64748b", fontFamily: F, fontSize: 10, fontWeight: page === id ? 700 : 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all .15s" }}><span style={{ fontSize: 13 }}>{ic}</span>{l}</button>;
  const logColor = tp => tp?.includes("win") ? "#4ade80" : tp?.includes("lose") ? "#f87171" : tp?.startsWith("p") ? "#38bdf8" : tp?.startsWith("o") ? "#f59e0b" : "#94a3b8";

  return (
    <div style={{ minHeight: "100vh", background: "#030712", fontFamily: F, position: "relative" }}>
      <style>{css}</style><Bubbles />
      {notif && <div style={{ position: "fixed", top: 14, right: 14, zIndex: 1000, padding: "9px 16px", borderRadius: 7, background: notif.t === "info" ? "#1e3a5f" : notif.t === "error" ? "#450a0a" : "#064e3b", border: `1px solid ${notif.t === "info" ? "#0ea5e922" : notif.t === "error" ? "#f8717122" : "#4ade8022"}`, color: "#e2e8f0", fontSize: 10, fontFamily: F, animation: "notifSlide .25s", boxShadow: "0 4px 20px rgba(0,0,0,.4)", maxWidth: 300 }}>{notif.m}</div>}

      {/* Reveal */}
      {revealPhase && <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(3,7,18,.93)", backdropFilter: "blur(14px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "fadeIn .3s" }}>
        {revealPhase === "done" && <button onClick={() => { setRevealCard(null); setRevealPhase(null); }} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "1px solid #334155", borderRadius: 5, color: "#94a3b8", padding: "5px 12px", cursor: "pointer", fontFamily: F, fontSize: 9 }}>Close</button>}
        {(revealPhase === "minting" || revealPhase === "generating") && <div style={{ textAlign: "center", animation: "slideUp .4s" }}>
          <div style={{ width: 90, height: 90, borderRadius: "50%", background: "#0ea5e908", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", position: "relative" }}><div style={{ position: "absolute", inset: -2, border: "2px solid transparent", borderTop: "2px solid #0ea5e9", borderRadius: "50%", animation: "spin 1.5s linear infinite" }} /><span style={{ fontSize: 36 }}>🐋</span></div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#e2e8f0" }}>{revealPhase === "minting" ? "Minting on Tempo..." : "Oracle Generating Stats..."}</div>
          <div style={{ fontSize: 9, color: "#64748b", marginTop: 3 }}>{revealPhase === "minting" ? "Confirm in MetaMask" : "AI analyzing your whale traits"}</div>
        </div>}
        {(revealPhase === "revealing" || revealPhase === "done") && revealCard && <div style={{ textAlign: "center" }}>
          <div style={{ animation: "cardFlip .7s ease-out", borderRadius: 12 }}><GameCard card={revealCard} size="large" /></div>
          {revealPhase === "done" && <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: ELEMENTS[revealCard.element]?.color, animation: "slideUp .4s ease .2s both" }}>{ELEMENTS[revealCard.element]?.icon} {ELEMENTS[revealCard.element]?.name} {RARITIES[revealCard.rarity]}!</div>
            <Btn onClick={() => { setRevealCard(null); setRevealPhase(null); setPage("cards"); }} style={{ marginTop: 12 }}>View Cards →</Btn>
          </div>}
        </div>}
      </div>}

      {/* Offer Modal */}
      {showOffer && <div style={{ position: "fixed", inset: 0, zIndex: 800, background: "rgba(3,7,18,.9)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s" }}>
        <div style={{ background: "#0f172a", borderRadius: 14, border: "1px solid #1e293b", padding: 20, width: 340, maxWidth: "calc(100vw - 32px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><span style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>Make Offer on #{offerTarget?.id}</span><button onClick={() => { setShowOffer(false); setOfferTarget(null); }} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14 }}>✕</button></div>
          <div style={{ marginBottom: 12 }}><span style={{ fontSize: 9, color: "#64748b" }}>Offer (PATHUSD):</span><input type="number" value={offerAmt} onChange={e => setOfferAmt(e.target.value)} placeholder="0.00" style={{ width: "100%", marginTop: 3, padding: "9px 10px", borderRadius: 6, background: "#0a0e27", border: "1px solid #1e293b", color: "#e2e8f0", fontFamily: F, fontSize: 13, outline: "none" }} /><span style={{ fontSize: 7, color: "#475569" }}>Balance: {walletBalance} PATHUSD</span></div>
          <div style={{ display: "flex", gap: 6 }}><Btn onClick={() => { notify(`Offer $${offerAmt} placed!`); setShowOffer(false); setOfferAmt(""); setOfferTarget(null); }} disabled={!offerAmt} style={{ flex: 1 }}>Place Offer</Btn><Btn onClick={() => { setShowOffer(false); setOfferTarget(null); }} bg="#1e293b" style={{ border: "1px solid #334155", color: "#94a3b8" }}>Cancel</Btn></div>
        </div>
      </div>}

      {/* Header */}
      <header style={{ position: "relative", zIndex: 10, padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #0ea5e907", background: "rgba(3,7,18,.85)", backdropFilter: "blur(10px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 20 }}>🐋</span><span style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0" }}>WHALEMON</span><span style={{ fontSize: 7, color: "#0ea5e9", letterSpacing: 2 }}>TCG</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ padding: "4px 8px", borderRadius: 5, background: "#0ea5e907", border: "1px solid #0ea5e915", fontSize: 8, color: "#38bdf8", display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: "#4ade80" }} />Tempo</div>
          <div style={{ padding: "4px 8px", borderRadius: 5, background: "#111827", border: "1px solid #1e293b", fontSize: 10, color: "#4ade80", fontWeight: 700 }}>${walletBalance} <span style={{ color: "#475569", fontWeight: 400 }}>USD</span></div>
          <div style={{ padding: "4px 8px", borderRadius: 5, background: "#111827", border: "1px solid #1e293b", fontSize: 9, color: "#e2e8f0" }}>{walletAddr.slice(0, 6)}...{walletAddr.slice(-4)}</div>
          <button onClick={handleDisconnect} style={{ padding: "4px 8px", borderRadius: 5, background: "transparent", border: "1px solid #dc262628", fontSize: 8, color: "#f87171", cursor: "pointer", fontFamily: F }}>Disconnect</button>
        </div>
      </header>

      <nav style={{ position: "relative", zIndex: 10, padding: "6px 18px", display: "flex", gap: 2, borderBottom: "1px solid #0ea5e905", background: "rgba(3,7,18,.5)", overflowX: "auto" }}>
        <Nav l="My Whales" ic="🐋" id="whales" /><Nav l="My Cards" ic="🃏" id="cards" /><Nav l="Battle" ic="⚔️" id="battle" /><Nav l="Marketplace" ic="🏪" id="market" /><Nav l="Leaderboard" ic="🏆" id="leaderboard" />
      </nav>

      <main style={{ position: "relative", zIndex: 10, padding: 18, maxWidth: 1180, margin: "0 auto", animation: "fadeIn .3s" }}>

        {/* WHALES */}
        {page === "whales" && <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div><h2 style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 3 }}>My Whales</h2><p style={{ fontSize: 10, color: "#64748b" }}>Generate a Whalemon card from each WHEL NFT — free, one per whale.</p></div>
            <Btn small onClick={() => { loadWhales(); loadCards(); }} bg="#1e293b" style={{ border: "1px solid #334155", color: "#94a3b8" }}>🔄 Refresh</Btn>
          </div>
          {loadingWhales && <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontSize: 10 }}><div style={{ width: 24, height: 24, border: "2px solid #0ea5e928", borderTop: "2px solid #0ea5e9", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />Loading your WHEL NFTs...</div>}
          {!loadingWhales && myWhales.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#475569", fontSize: 10 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🐋</div>
            <div>No WHEL NFTs found in your wallet.</div>
            <div style={{ fontSize: 8, marginTop: 4, color: "#334155" }}>You need WHEL NFTs to generate Whalemon cards.</div>
          </div>}
          <div className="wm-cards-grid">{myWhales.map(w => <div key={w.id} style={{ width: 180, maxWidth: "calc(50% - 8px)", minWidth: 150, borderRadius: 10, background: "#0f172a", border: "1px solid #1e293b", overflow: "hidden", transition: "all .2s", position: "relative" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "none"}>
            <CardImg src={w.image} el={0} h={150} />
            <div style={{ position: "absolute", top: 5, left: 5, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,.6)", fontSize: 9, color: "#e2e8f0", fontWeight: 700 }}>#{w.id}</div>
            <div style={{ padding: 8 }}>
              {mintedIds.has(w.id) ? <div style={{ padding: "5px 0", borderRadius: 5, background: "#065f460d", border: "1px solid #065f4620", textAlign: "center", fontSize: 9, color: "#4ade80" }}>✓ Card Minted</div>
                : <Btn small onClick={() => handleMint(w.id)} disabled={minting === w.id} style={{ width: "100%" }}>{minting === w.id ? "Minting..." : "⚡ Generate Card"}</Btn>}
            </div>
            {minting === w.id && <div style={{ position: "absolute", inset: 0, background: "rgba(3,7,18,.85)", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}><div style={{ width: 24, height: 24, border: "2px solid #0ea5e928", borderTop: "2px solid #0ea5e9", borderRadius: "50%", animation: "spin 1s linear infinite" }} /><span style={{ fontSize: 8, color: "#38bdf8" }}>Minting...</span></div>}
          </div>)}</div>
        </div>}

        {/* CARDS */}
        {page === "cards" && <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div><h2 style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 3 }}>My Cards</h2><p style={{ fontSize: 10, color: "#64748b" }}>Your battle-ready cards. Click to inspect.</p></div>
            <Btn small onClick={loadCards} bg="#1e293b" style={{ border: "1px solid #334155", color: "#94a3b8" }}>🔄 Refresh</Btn>
          </div>
          {loadingCards && <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontSize: 10 }}><div style={{ width: 24, height: 24, border: "2px solid #0ea5e928", borderTop: "2px solid #0ea5e9", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />Loading your cards...</div>}
          {!loadingCards && myCards.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#475569", fontSize: 10 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🃏</div>
            <div>No cards yet. Generate cards from your WHEL NFTs!</div>
            <Btn onClick={() => setPage("whales")} style={{ marginTop: 12 }}>Go to My Whales →</Btn>
          </div>}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, flex: 1 }}>{myCards.map(c => <GameCard key={c.id} card={c} onClick={() => setSelectedCard(c)} />)}</div>
            {selectedCard && <div style={{ width: 300, maxWidth: "100%", flexShrink: 0, position: "sticky", top: 18, alignSelf: "flex-start", animation: "slideUp .3s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Details</span><button onClick={() => setSelectedCard(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14 }}>✕</button></div>
              <GameCard card={selectedCard} size="large" />
              <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "#0f172a", border: "1px solid #1e293b" }}><div style={{ fontSize: 8, color: "#64748b" }}>TOTAL POWER</div><div style={{ fontSize: 20, fontWeight: 800, color: "#e2e8f0" }}>{selectedCard.attack + selectedCard.defense + Math.floor(selectedCard.health / 3) + selectedCard.speed}</div></div>
            </div>}
          </div>
        </div>}

        {/* BATTLE */}
        {page === "battle" && <div>
          {!battleState && <div style={{ textAlign: "center", paddingTop: 28, animation: "slideUp .4s" }}>
            <div style={{ fontSize: 50, marginBottom: 14 }}>⚔️</div><h2 style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 5 }}>Battle Arena</h2>
            <p style={{ fontSize: 10, color: "#64748b", maxWidth: 380, margin: "0 auto 18px" }}>Choose your battle mode. Ranked matches cost 1 PATHUSD entry.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {[{ m: "free", ic: "🎯", t: "Practice", d: "vs AI · Free", bc: "#22c55e30", hc: "#22c55e" }, { m: "ranked-ai", ic: "🤖", t: "Ranked AI", d: "vs AI · 1 PATHUSD", bc: "#0ea5e930", hc: "#0ea5e9" }, { m: "pvp", ic: "👥", t: "Ranked PvP", d: "vs Player · 1 PATHUSD", bc: "#8b5cf630", hc: "#8b5cf6" }].map(x => <button key={x.m} onClick={() => startBattle(x.m)} style={{ padding: "18px 24px", borderRadius: 10, background: "#0f172a", border: `1px solid ${x.bc}`, width: 165, cursor: "pointer", textAlign: "center", transition: "all .2s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = x.hc; e.currentTarget.style.transform = "translateY(-2px)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = x.bc; e.currentTarget.style.transform = "none"; }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{x.ic}</div><div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", fontFamily: F }}>{x.t}</div><div style={{ fontSize: 8, color: "#64748b", fontFamily: F, marginTop: 1 }}>{x.d}</div>
              </button>)}
            </div>
          </div>}
          {battleState === "select" && <div style={{ animation: "slideUp .3s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><div><h2 style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>Choose Your Whalemon</h2><p style={{ fontSize: 9, color: "#64748b" }}>{battleMode === "free" ? "Practice (free)" : "Ranked (1 PATHUSD)"}</p></div><Btn small onClick={exitBattle} bg="#1e293b" style={{ border: "1px solid #334155", color: "#94a3b8" }}>← Back</Btn></div>
            {myCards.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#475569", fontSize: 10 }}>No cards yet! <button onClick={() => { exitBattle(); setPage("whales"); }} style={{ color: "#0ea5e9", background: "none", border: "none", cursor: "pointer", fontFamily: F, fontSize: 10 }}>Generate cards first →</button></div>
              : <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{myCards.map(c => <GameCard key={c.id} card={c} onClick={() => pickCard(c)} />)}</div>}
          </div>}
          {battleState === "fighting" && pCard && oCard && <div style={{ animation: "fadeIn .3s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><span style={{ fontSize: 10, color: "#64748b" }}>Turn {bTurn} · {battleMode === "free" ? "Practice" : battleMode === "ranked-ai" ? "Ranked AI" : "PvP"}</span><Btn small onClick={exitBattle} bg="#1e293b" style={{ border: "1px solid #334155", color: "#94a3b8" }}>{bResult ? "Exit" : "Forfeit"}</Btn></div>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              {[{ lbl: "YOUR WHALEMON", c: pCard, clr: "#4ade80" }, null, { lbl: battleMode === "pvp" ? "OPPONENT" : "AI", c: oCard, clr: "#f87171" }].map((s, i) => {
                if (!s) return <div key={i} style={{ display: "flex", alignItems: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b" }}>VS</div></div>;
                const cc = s.c, hp = Math.max(0, cc.currentHp ?? cc.health), pct = hp / cc.health;
                return <div key={i} style={{ flex: "1 1 250px", maxWidth: 300 }}>
                  <div style={{ textAlign: "center", marginBottom: 5, fontSize: 9, color: s.clr, fontWeight: 700 }}>{s.lbl}</div>
                  <div style={{ background: "#0f172a", borderRadius: 10, border: `1px solid ${ELEMENTS[cc.element]?.color || "#1e293b"}20`, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>#{cc.id}</span><span style={{ fontSize: 8, color: ELEMENTS[cc.element]?.color }}>{ELEMENTS[cc.element]?.icon} {ELEMENTS[cc.element]?.name}</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden" }}><CardImg src={cc.image} el={cc.element} h={40} /></div>
                      <div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#94a3b8", marginBottom: 2 }}><span>HP</span><span>{hp}/{cc.health}</span></div>
                        <div style={{ height: 7, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct * 100}%`, height: "100%", background: pct > .5 ? "#4ade80" : pct > .2 ? "#facc15" : "#f87171", borderRadius: 3, transition: "all .4s" }} /></div></div>
                    </div>
                  </div>
                </div>;
              })}
            </div>
            {!bResult && <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 14 }}>
              <Btn onClick={() => doMove("atk")} bg="linear-gradient(135deg,#dc2626,#b91c1c)">⚔️ Attack</Btn>
              <Btn onClick={() => doMove("ab")} disabled={abCd > 0} bg="linear-gradient(135deg,#8b5cf6,#6d28d9)">🌀 {pCard.ability}{abCd > 0 ? ` (${abCd})` : ""}</Btn>
              <Btn onClick={() => doMove("def")} bg="linear-gradient(135deg,#0ea5e9,#0284c7)">🛡️ Defend</Btn>
            </div>}
            {bResult && <div style={{ textAlign: "center", marginTop: 16, padding: "14px 24px", borderRadius: 10, background: bResult === "win" ? "#064e3b" : bResult === "lose" ? "#450a0a" : "#1e293b", border: `1px solid ${bResult === "win" ? "#4ade8028" : bResult === "lose" ? "#f8717128" : "#64748b28"}`, animation: "slideUp .3s" }}>
              <div style={{ fontSize: 26 }}>{bResult === "win" ? "🏆" : bResult === "lose" ? "💀" : "🤝"}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: bResult === "win" ? "#4ade80" : bResult === "lose" ? "#f87171" : "#94a3b8", marginTop: 3 }}>{bResult === "win" ? "VICTORY!" : bResult === "lose" ? "DEFEATED" : "DRAW"}</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}><Btn small onClick={() => { exitBattle(); startBattle(battleMode); }}>Again</Btn><Btn small onClick={exitBattle} bg="#1e293b" style={{ border: "1px solid #334155", color: "#94a3b8" }}>Exit</Btn></div>
            </div>}
            <div style={{ marginTop: 14, padding: 10, borderRadius: 8, background: "#0a0e27", border: "1px solid #1e293b", maxHeight: 140, overflowY: "auto" }}>
              <div style={{ fontSize: 7, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Battle Log</div>
              {bLog.map((l, i) => <div key={i} style={{ fontSize: 9, padding: "1px 0 1px 5px", color: logColor(l.tp), borderLeft: `2px solid ${logColor(l.tp)}20` }}>{l.txt}</div>)}
            </div>
          </div>}
        </div>}

        {/* MARKETPLACE */}
        {page === "market" && <div style={{ animation: "slideUp .3s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div><h2 style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0" }}>Marketplace</h2><p style={{ fontSize: 9, color: "#64748b" }}>Trade Whalemon cards in PATHUSD</p></div>
          </div>
          <div style={{ textAlign: "center", padding: 40, color: "#475569", fontSize: 10 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏪</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Marketplace Coming Soon</div>
            <div style={{ fontSize: 9 }}>Card trading will be available once cards are minted.</div>
            <div style={{ marginTop: 16, padding: "8px 14px", borderRadius: 8, background: "#0f172a", border: "1px solid #1e293b", display: "inline-block" }}>
              <div style={{ fontSize: 8, color: "#475569" }}>Contract</div>
              <div style={{ fontSize: 9, color: "#38bdf8" }}>{CONTRACTS.MARKETPLACE.slice(0, 10)}...{CONTRACTS.MARKETPLACE.slice(-6)}</div>
            </div>
          </div>
        </div>}

        {/* LEADERBOARD */}
        {page === "leaderboard" && <div style={{ animation: "slideUp .3s" }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 3 }}>Leaderboard</h2>
          <p style={{ fontSize: 10, color: "#64748b", marginBottom: 14 }}>Top Whalemon commanders</p>
          <div style={{ textAlign: "center", padding: 40, color: "#475569", fontSize: 10 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Season 1 Starting Soon</div>
            <div style={{ fontSize: 9 }}>Battle records will appear here once ranked matches begin.</div>
          </div>
        </div>}

      </main>
      <footer style={{ position: "relative", zIndex: 10, padding: "14px 18px", marginTop: 28, borderTop: "1px solid #0ea5e905", display: "flex", justifyContent: "space-between", fontSize: 8, color: "#1e293b" }}><span>Whalemon TCG</span><span>Tempo · PATHUSD · Chain 4217</span></footer>
    </div>
  );
}
