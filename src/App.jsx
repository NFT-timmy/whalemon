import { useState, useEffect } from "react";
import { BrowserProvider, Contract, formatUnits } from "ethers";

const TEMPO_CHAIN_ID = "0x1079";
const CONTRACTS = {
  WHEL_NFT:    "0x3e12fcb20ad532f653f2907d2ae511364e2ae696",
  WHALE_CARDS: "0xf482221cf5150868956D80cdE00F589dC227D78A",
  BATTLE_ARENA:"0x7C220371C08285dBc06C641EC42552A57A85215A",
  MARKETPLACE: "0xF66E45889adDc6e330B38C0727567f2608EEC475",
  PATHUSD:     "0x20c0000000000000000000000000000000000000",
};
const WHEL_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function ownerOf(uint256) view returns (address)",
    "function tokenURI(uint256) view returns (string)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ];
const WHALECARDS_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function ownerOf(uint256) view returns (address)",
    "function getCardStats(uint256) view returns (uint16,uint16,uint16,uint16,uint8,uint8,bytes32,bool)",
    "function hasMinted(uint256) view returns (bool)",
    "function mintCard(uint256) external",
    "event CardMinted(address indexed owner, uint256 indexed whaleId, uint256 indexed cardId)",
  ];
const PATHUSD_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];
const BATTLE_ABI = [
  "function createAIBattle(uint256 cardId) external returns (uint256)",
  "function makeMove(uint256 battleId, uint8 move) external",
  "function getBattle(uint256 battleId) external view returns (tuple(uint256 battleId,address player1,address player2,uint256 card1,uint256 card2,int16 hp1,int16 hp2,uint8 turn,uint8 lastAbility1,uint8 lastAbility2,bool isPlayer1Turn,uint8 defenseBoost1,uint8 defenseBoost2,uint8 status,uint8 mode,address winner,uint256 createdAt,uint256 finishedAt))",
  "function entryFee() view returns (uint256)",
  "function activeBattle(address) view returns (uint256)",
];

const ELEMENTS = [
  { name:"Abyss",   color:"#7c3aed", icon:"🌊", grad:"135deg,#1a0a2e,#2d1b69" },
  { name:"Tide",    color:"#0ea5e9", icon:"🌀", grad:"135deg,#0c4a6e,#0ea5e9" },
  { name:"Storm",   color:"#8b5cf6", icon:"⚡", grad:"135deg,#2e1065,#7c3aed" },
  { name:"Frost",   color:"#22d3ee", icon:"❄️", grad:"135deg,#083344,#22d3ee" },
  { name:"Coral",   color:"#f472b6", icon:"🪸", grad:"135deg,#500724,#ec4899" },
  { name:"Leviathan",color:"#ef4444",icon:"🔥", grad:"135deg,#450a0a,#dc2626" },
];
const RARITIES = ["Common","Uncommon","Rare","Epic","Legendary"];
const RARITY_COLORS = ["#94a3b8","#22c55e","#3b82f6","#a855f7","#f59e0b"];

// ── tiny helpers ──────────────────────────────────────────────────────────────
const el = (i) => ELEMENTS[i] ?? ELEMENTS[0];
const nftImg = (id) => `https://placehold.co/400x400/0c4a6e/38bdf8?text=WHEL+%23${id}`;

function StatBar({ label, value, max, color }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
      <span style={{width:32,fontSize:11,color:"#64748b",fontVariantNumeric:"tabular-nums"}}>{label}</span>
      <div style={{flex:1,height:5,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
        <div style={{width:`${Math.min(100,(value/max)*100)}%`,height:"100%",background:color,borderRadius:3,transition:"width .6s ease"}}/>
      </div>
      <span style={{width:28,fontSize:12,color:"#e2e8f0",textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:600}}>{value}</span>
    </div>
  );
}

function downloadCard(cardId) {
  const node = document.getElementById(`card-${cardId}`);
  if (!node) return;
  import("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js").then(() => {
    window.html2canvas(node, { useCORS: true, backgroundColor: null, scale: 2 }).then(canvas => {
      const a = document.createElement("a");
      a.download = `whalemon-card-${cardId}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    });
  });
}

function useImgBg(src) {
  const [bg, setBg] = useState("#0a0e1f");
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const p = ctx.getImageData(0, 0, 1, 1).data;
        setBg(`rgb(${p[0]},${p[1]},${p[2]})`);
      } catch(_) {}
    };
    img.src = src;
  }, [src]);
  return bg;
}

function Card({ card, size="md", onClick }) {
  const e = el(card.element);
  const lg = size==="lg";
  const imgBg = useImgBg(card.image);
  return (
    <div style={{display:"inline-flex",flexDirection:"column",alignItems:"flex-end"}}>
    <div id={`card-${card.id}`} onClick={onClick} style={{
      width:lg?340:250, borderRadius:14, background:"#0a0e1f",
      border:`1.5px solid ${e.color}30`,
      boxShadow:`0 0 24px ${e.color}0d`,
      cursor:onClick?"pointer":"default", overflow:"hidden",
      transition:"transform .18s,box-shadow .18s", flexShrink:0,
    }}
      onMouseEnter={o=>{o.currentTarget.style.transform="translateY(-4px)";o.currentTarget.style.boxShadow=`0 8px 32px ${e.color}22`;}}
      onMouseLeave={o=>{o.currentTarget.style.transform="none";o.currentTarget.style.boxShadow=`0 0 24px ${e.color}0d`;}}>
      {/* rarity stripe */}
      <div style={{height:3,background:RARITY_COLORS[card.rarity]??RARITY_COLORS[0],opacity:.8}}/>
      {/* image */}
      <div style={{height:lg?280:240,background:imgBg,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
          {card.image
            ? <img src={card.image} alt="" style={{width:"100%",height:"100%",objectFit:"contain",objectPosition:"center center",position:"absolute",inset:0}} onError={o=>{o.target.style.display="none";o.target.nextSibling.style.display="block";}}/>
            : null}
          <span style={{fontSize:lg?52:36,position:"relative",zIndex:1,display:card.image?"none":"block"}}>🐋</span>
        <div style={{position:"absolute",top:8,right:8,padding:"2px 8px",borderRadius:20,background:"rgba(0,0,0,.55)",fontSize:11,color:e.color,fontWeight:700}}>{e.icon} {e.name}</div>
      </div>
      {/* info */}
      <div style={{padding:lg?"14px 16px":"10px 12px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <span style={{fontSize:lg?16:13,fontWeight:700,color:"#f1f5f9"}}>#{card.id}</span>
          <span style={{fontSize:11,color:RARITY_COLORS[card.rarity]??RARITY_COLORS[0],fontWeight:600}}>★ {RARITIES[card.rarity]??"Common"}</span>
        </div>
        <div style={{marginBottom:6}}>
          <StatBar label="ATK" value={card.attack}   max={100} color="#f87171"/>
          <StatBar label="DEF" value={card.defense}  max={100} color="#60a5fa"/>
          <StatBar label="HP"  value={card.health}   max={300} color="#4ade80"/>
          <StatBar label="SPD" value={card.speed}    max={100} color="#facc15"/>
        </div>
        {card.ability && <div style={{padding:"6px 8px",borderRadius:8,background:`${e.color}0f`,border:`1px solid ${e.color}18`}}>
          <div style={{fontSize:12,color:e.color,fontWeight:700}}>{card.ability}</div>
          {lg && <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{card.abilityDesc}</div>}
        </div>}
      </div>
    </div>
    <button onClick={e=>{e.stopPropagation();downloadCard(card.id);}} title="Download card" style={{marginTop:6,padding:"5px 8px",borderRadius:8,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)",color:"#475569",fontSize:14,cursor:"pointer",lineHeight:1}}>↓</button>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function WhalemonTCG() {
  const [connected,setConnected]   = useState(false);
  const [addr,setAddr]             = useState("");
  const [balance,setBalance]       = useState("0.00");
  const [page,setPage]             = useState("whales");
  const [provider,setProvider]     = useState(null);
  const [notif,setNotif]           = useState(null);

  // whales
  const [whales,setWhales]         = useState([]);
  const [mintedIds,setMintedIds]   = useState(new Set());
  const [loadingW,setLoadingW]     = useState(false);
  const [minting,setMinting]       = useState(null);
  const [revealCard,setRevealCard] = useState(null);
  const [revealPhase,setRevealPhase]= useState(null);

  // cards
  const [cards,setCards]           = useState([]);
  const [loadingC,setLoadingC]     = useState(false);
  const [picked,setPicked]         = useState(null);

  // battle
  const [bMode,setBMode]           = useState(null);
  const [bState,setBState]         = useState(null);
  const [pCard,setPCard]           = useState(null);
  const [oCard,setOCard]           = useState(null);
  const [bLog,setBLog]             = useState([]);
  const [bTurn,setBTurn]           = useState(1);
  const [bCd,setBCd]               = useState(0);
  const [bResult,setBResult]       = useState(null);

  const toast = (m,t="ok") => { setNotif({m,t}); setTimeout(()=>setNotif(null),3500); };

  useEffect(()=>{
    if(connected && addr && provider){ loadBalance(); loadWhales(); loadCards(); }
  },[connected,addr]);

  // ── blockchain ──────────────────────────────────────────────────────────────
  const ensureTempo = async () => {
    try {
      await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:TEMPO_CHAIN_ID}]});
    } catch(e) {
      if(e.code===4902) await window.ethereum.request({
        method:"wallet_addEthereumChain",
        params:[{chainId:TEMPO_CHAIN_ID,chainName:"Tempo Network",
          rpcUrls:["https://rpc.tempo.xyz"],
          nativeCurrency:{name:"PATHUSD",symbol:"PATHUSD",decimals:18},
          blockExplorerUrls:["https://explore.tempo.xyz"]}]
      });
    }
    return new BrowserProvider(window.ethereum);
  };

  const loadBalance = async () => {
    try {
      const prov = await ensureTempo();
      const c = new Contract(CONTRACTS.PATHUSD,PATHUSD_ABI,prov);
      const [raw,dec] = await Promise.all([c.balanceOf(addr),c.decimals()]);
      setBalance(parseFloat(formatUnits(raw,dec)).toFixed(2));
    } catch(e){ console.warn("balance",e); }
  };

const loadWhales = async () => {
      setLoadingW(true);
      try {
        const prov   = await ensureTempo();
        const whel   = new Contract(CONTRACTS.WHEL_NFT,   WHEL_ABI,      prov);
        const wCards = new Contract(CONTRACTS.WHALE_CARDS,WHALECARDS_ABI,prov);
        const bal    = Number(await whel.balanceOf(addr));
        console.log("[whales] balance",bal);
        if(bal===0){ setWhales([]); setMintedIds(new Set()); toast("No WHEL NFTs found on Tempo Network","info"); setLoadingW(false); return; }
        console.log("[whales] scanning ownerOf for token IDs 0-3333...");
        const ids = [];
        const batchSize = 5;
        for(let start=0; start<3333 && ids.length<bal; start+=batchSize){
          const checks = [];
          for(let j=start; j<Math.min(start+batchSize,3333); j++){
            checks.push(
              whel.ownerOf(j).then(o => o.toLowerCase()===addr.toLowerCase() ? j : null).catch(()=>null)
            );
          }
          const results = await Promise.all(checks);
          for(const r of results) if(r!==null) ids.push(r);
          if(start % 100 === 0) console.log("[whales] scanned", Math.min(start+batchSize,3333), "/ 3333, found", ids.length, "of", bal);
          if(ids.length>=bal) break;
          await new Promise(r=>setTimeout(r,200));
        }
        console.log("[whales] owned token IDs:", ids);
        const list=[], minted=new Set();
        for(const id of ids){
          let img = nftImg(id);
          try {
            const uri = await whel.tokenURI(id);
            if(uri.startsWith("data:application/json")){
              const json = uri.startsWith("data:application/json;base64,")
                ? JSON.parse(atob(uri.split(",")[1]))
                : JSON.parse(decodeURIComponent(uri.split(",")[1]));
              if(json.image) img = json.image.startsWith("ipfs://") ? json.image.replace("ipfs://","https://ipfs.io/ipfs/") : json.image;
            } else if(uri.startsWith("http")||uri.startsWith("ipfs://")){
              const fetchUrl = uri.startsWith("ipfs://") ? uri.replace("ipfs://","https://ipfs.io/ipfs/") : uri;
              const resp = await fetch(fetchUrl);
              const json = await resp.json();
              if(json.image) img = json.image.startsWith("ipfs://") ? json.image.replace("ipfs://","https://ipfs.io/ipfs/") : json.image;
            }
          } catch(e){ console.warn("tokenURI failed for",id,e); }
          let minted_ = false;
          try{ minted_ = await wCards.hasMinted(id); }catch(_){}
          if(minted_) minted.add(id);
          list.push({id, image:img});
        }
        setWhales(list); setMintedIds(minted);
      } catch(e){ console.error("loadWhales",e); toast("Could not load WHEL NFTs \u2014 check you're on Tempo","err"); }
      setLoadingW(false);
    };

  const loadCards = async () => {
    setLoadingC(true);
    try {
      const prov   = await ensureTempo();
      const wCards = new Contract(CONTRACTS.WHALE_CARDS,WHALECARDS_ABI,prov);
        const whel   = new Contract(CONTRACTS.WHEL_NFT,WHEL_ABI,prov);
        const bal    = Number(await wCards.balanceOf(addr));
        console.log("[cards] balance",bal);
        if(bal===0){ setCards([]); setLoadingC(false); return; }
        const ids = [];
        const batchSize = 5;
        for(let start=0; start<3333 && ids.length<bal; start+=batchSize){
          const checks = [];
          for(let j=start; j<Math.min(start+batchSize,3333); j++){
            checks.push(
              wCards.ownerOf(j).then(o => o.toLowerCase()===addr.toLowerCase() ? j : null).catch(()=>null)
            );
          }
          const results = await Promise.all(checks);
          for(const r of results) if(r!==null) ids.push(r);
          if(ids.length>=bal) break;
          await new Promise(r=>setTimeout(r,200));
        }
        console.log("[cards] owned card IDs:", ids);
        const list=[];
        for(const id of ids){
          try {
            let img = nftImg(id);
            try {
              const uri = await whel.tokenURI(id);
              if(uri.startsWith("data:application/json")){
                const json = uri.startsWith("data:application/json;base64,")
                  ? JSON.parse(atob(uri.split(",")[1]))
                  : JSON.parse(decodeURIComponent(uri.split(",")[1]));
                if(json.image) img = json.image.startsWith("ipfs://") ? json.image.replace("ipfs://","https://ipfs.io/ipfs/") : json.image;
              } else if(uri.startsWith("http")||uri.startsWith("ipfs://")){
                const fetchUrl = uri.startsWith("ipfs://") ? uri.replace("ipfs://","https://ipfs.io/ipfs/") : uri;
                const resp = await fetch(fetchUrl);
                const json = await resp.json();
                if(json.image) img = json.image.startsWith("ipfs://") ? json.image.replace("ipfs://","https://ipfs.io/ipfs/") : json.image;
              }
            } catch(e){ console.warn("card tokenURI failed for",id,e); }
            const raw  = await wCards.getCardStats(id);
            const isSet = raw[7];
            list.push({id,image:img,element:Number(raw[4]),rarity:Number(raw[5]),
              attack:Number(raw[0]),defense:Number(raw[1]),health:Number(raw[2]),speed:Number(raw[3]),
              ability:isSet?"Ocean Strike":"Awaiting stats...",abilityDesc:isSet?"A powerful ocean attack.":"Oracle is generating stats.",
              statsReady:isSet});
          } catch(e){ console.warn("card load",id,e); }
        }
        setCards(list);
    } catch(e){ console.error("loadCards",e); }
    setLoadingC(false);
  };

  const handleConnect = async () => {
    if(!window.ethereum){ alert("Please install MetaMask."); return; }
    try {
      const [acc] = await window.ethereum.request({method:"eth_requestAccounts"});
      const prov  = await ensureTempo();
      setProvider(prov); setAddr(acc); setConnected(true);
      toast("Connected to Tempo ✓");
    } catch(e){ alert("Connect failed: "+e.message); }
  };

  const handleDisconnect = () => {
    setConnected(false); setAddr(""); setBalance("0.00");
    setWhales([]); setCards([]); setMintedIds(new Set()); setPage("whales");
  };

  const handleMint = async (whaleId) => {
    if(!provider) return;
    setMinting(whaleId); setRevealPhase("minting");
    try {
      const signer = await provider.getSigner();
      const wCards = new Contract(CONTRACTS.WHALE_CARDS,WHALECARDS_ABI,signer);
      const tx     = await wCards.mintCard(whaleId);
      setRevealPhase("generating"); toast("Tx submitted — waiting…");
      await tx.wait();
      toast("Minted! Oracle is generating stats…");
      await new Promise(r=>setTimeout(r,5000));
      await loadCards(); await loadBalance();
      const whaleData = whales.find(w=>w.id===whaleId);
        const fresh = cards.find(c=>c.id===whaleId) || {
          id:whaleId,image:whaleData?.image||nftImg(whaleId),
        element:Math.floor(Math.random()*6),
        rarity:[0,0,0,1,1,2,2,3,4][Math.floor(Math.random()*9)],
        attack:30+Math.floor(Math.random()*60),defense:30+Math.floor(Math.random()*60),
        health:100+Math.floor(Math.random()*180),speed:30+Math.floor(Math.random()*60),
        ability:"Ocean Strike",abilityDesc:"A powerful ocean attack.",
      };
      setMintedIds(p=>new Set([...p,whaleId]));
      setRevealCard(fresh); setRevealPhase("done");
    } catch(e){
      console.error("mint",e);
      toast("Mint failed: "+(e.reason||e.message||"Unknown"),"err");
      setRevealPhase(null);
    }
    setMinting(null);
  };

  // ── battle ──────────────────────────────────────────────────────────────────
  const [battleId,setBattleId] = useState(null);
  const [bPending,setBPending] = useState(false);

  const startBattle = m => { setBMode(m);setBState("select");setBLog([]);setBTurn(1);setBCd(0);setBResult(null);setPCard(null);setOCard(null);setBattleId(null); };

  const adv=(a,d)=>({0:3,3:4,4:1,1:5,5:2,2:0}[a]===d);
  const calcDmg=(a,d,ab,adv_)=>Math.max(5,Math.round((a.attack*100/(100+d.defense))*(ab?1.8:1)*(adv_?1.5:1)*(0.9+Math.random()*.2)));

  const pickCard = async c => {
    if(bMode==="free"){
      setPCard({...c,hp:c.health});
      const r=[0,0,1,1,2,2,3][Math.floor(Math.random()*7)],m=[1,1.1,1.25,1.4,1.6][r],
        hp=Math.round((100+Math.random()*150)*m),eIdx=Math.floor(Math.random()*6);
      setOCard({id:"AI",element:eIdx,rarity:r,
        attack:Math.round((30+Math.random()*50)*m),defense:Math.round((30+Math.random()*50)*m),
        health:hp,speed:Math.round((30+Math.random()*50)*m),
        ability:["Void Pulse","Riptide Slash","Thunder Breach","Ice Barb","Reef Sting","Crushing Jaw"][eIdx],
        hp});
      setBState("fight"); setBLog([{t:0,s:"Battle started! (Practice)",tp:"sys"}]);
      return;
    }
    // ranked-ai — on-chain
    setBPending(true);
    try {
      const prov = await ensureTempo();
      const signer = await prov.getSigner();
      const pathusd = new Contract(CONTRACTS.PATHUSD, PATHUSD_ABI, signer);
      const arena   = new Contract(CONTRACTS.BATTLE_ARENA, BATTLE_ABI, signer);
      const fee     = await arena.entryFee();
      if(fee > 0n){
        const allowance = await pathusd.allowance(addr, CONTRACTS.BATTLE_ARENA);
        const decimals = await pathusd.decimals();
        const approveAmount = 10n * (10n ** BigInt(decimals));
        if(allowance < fee){
          toast("Approving PATHUSD…","info");
          const approveTx = await pathusd.approve(CONTRACTS.BATTLE_ARENA, approveAmount);
          await approveTx.wait();
        }
      }
      toast("Creating battle on-chain…","info");
      const tx = await arena.createAIBattle(c.id);
      const receipt = await tx.wait();
      const event = receipt.logs.map(log=>{ try{ return arena.interface.parseLog(log); }catch(_){return null;} }).find(e=>e&&e.name==="BattleCreated");
      const bid = event ? event.args.battleId : await arena.activeBattle(addr);
      setBattleId(bid);
      const battle = await arena.getBattle(bid);
      const aiHp = Number(battle.hp2);
      const aiEl = Math.floor(Math.random()*6);
      setPCard({...c, hp:c.health});
      setOCard({id:"AI",element:aiEl,rarity:1,attack:50,defense:40,health:aiHp,speed:40,ability:"AI Strike",abilityDesc:"The AI attacks.",hp:aiHp});
      setBState("fight"); setBLog([{t:0,s:"Ranked AI battle started! 1 PATHUSD entry fee paid.",tp:"sys"}]);
    } catch(e){
      console.error("createAIBattle",e);
      toast("Battle start failed: "+(e.reason||e.message||"Unknown"),"err");
    }
    setBPending(false);
  };

  const doMove = async mv => {
    if(!pCard||!oCard||bResult) return;
    if(bMode==="free"){
      const p={...pCard},o={...oCard},l=[...bLog]; let cd=bCd,t=bTurn;
      const pa=adv(p.element,o.element);
      if(mv==="atk"){ const d=calcDmg(p,o,false,pa); o.hp-=d; l.push({t,s:`Attack: ${d} dmg${pa?" ⚡":""}`,tp:"p"}); }
      else if(mv==="ab"){ if(cd>0) return; const d=calcDmg(p,o,true,pa); o.hp-=d; cd=3; l.push({t,s:`${p.ability}: ${d} dmg${pa?" ⚡":""}`,tp:"pa"}); }
      else { l.push({t,s:"Defend! (50% reduction next hit)",tp:"pd"}); }
      if(o.hp<=0){ o.hp=0; l.push({t,s:"Enemy defeated! Victory! 🏆",tp:"win"}); setPCard(p);setOCard(o);setBLog(l);setBResult("win"); return; }
      await new Promise(r=>setTimeout(r,500));
      const oa=adv(o.element,p.element),roll=Math.random();
      if(o.hp<o.health*.3&&roll<.3) l.push({t,s:"Enemy defends!",tp:"od"});
      else if(roll<.35){ let d=calcDmg(o,p,true,oa); if(mv==="def") d=Math.round(d/2); p.hp-=d; l.push({t,s:`Enemy ${o.ability}: ${d} dmg${oa?" ⚡":""}`,tp:"oa"}); }
      else { let d=calcDmg(o,p,false,oa); if(mv==="def") d=Math.round(d/2); p.hp-=d; l.push({t,s:`Enemy attacks: ${d} dmg${oa?" ⚡":""}`,tp:"o"}); }
      if(p.hp<=0){ p.hp=0; l.push({t,s:"Defeated! 💀",tp:"lose"}); setBResult("lose"); }
      if(t>=30&&!bResult){ const r=p.hp>o.hp?"win":p.hp<o.hp?"lose":"draw"; l.push({t,s:`Max turns — ${r}!`,tp:"sys"}); setBResult(r); }
      setPCard(p); setOCard(o); setBLog(l); setBTurn(t+1); setBCd(Math.max(0,cd-1));
      return;
    }
    // ranked-ai — on-chain
    if(!battleId) return;
    setBPending(true);
    try {
      const prov = await ensureTempo();
      const signer = await prov.getSigner();
      const arena = new Contract(CONTRACTS.BATTLE_ARENA, BATTLE_ABI, signer);
      const moveType = mv==="atk"?0:mv==="ab"?1:2;
      const tx = await arena.makeMove(battleId, moveType);
      await tx.wait();
      const battle = await arena.getBattle(battleId);
      const battleStatus = Number(battle.status);
      const p={...pCard}, o={...oCard}, l=[...bLog], t=bTurn;
      const newPHp = Math.max(0, Number(battle.hp1));
      const newOHp = Math.max(0, Number(battle.hp2));
      p.hp = newPHp; o.hp = newOHp;
      const mvLabel = mv==="atk"?"Attack":mv==="ab"?pCard.ability:"Defend";
      l.push({t, s:`${mvLabel} → Your HP: ${newPHp} / Enemy HP: ${newOHp}`, tp:"p"});
      if(battleStatus===2){ // Finished
        const won = battle.winner.toLowerCase()===addr.toLowerCase();
        const draw = battle.winner==="0x0000000000000000000000000000000000000000";
        const result = draw?"draw":won?"win":"lose";
        l.push({t, s:result==="win"?"Victory! 🏆 Prize awarded!":result==="lose"?"Defeated! 💀":"Draw 🤝", tp:result==="win"?"win":result==="lose"?"lose":"sys"});
        setPCard(p); setOCard(o); setBLog(l); setBResult(result);
        await loadBalance();
      } else if(newPHp<=0||newOHp<=0){
        const result = newOHp<=0?"win":newPHp<=0?"lose":"draw";
        l.push({t, s:result==="win"?"Victory! 🏆":result==="lose"?"Defeated! 💀":"Draw 🤝", tp:result==="win"?"win":result==="lose"?"lose":"sys"});
        setPCard(p); setOCard(o); setBLog(l); setBResult(result);
        await loadBalance();
      } else {
        setPCard(p); setOCard(o); setBLog(l); setBTurn(t+1);
        if(mv==="ab") setBCd(3); else setBCd(c=>Math.max(0,c-1));
      }
    } catch(e){
      console.error("makeMove",e);
      toast("Move failed: "+(e.reason||e.message||"Unknown"),"err");
    }
    setBPending(false);
  };

  const exitBattle=()=>{setBState(null);setBMode(null);setPCard(null);setOCard(null);setBLog([]);setBResult(null);setBattleId(null);};
  const logColor=tp=>tp?.includes("win")?"#4ade80":tp?.includes("lose")?"#f87171":tp?.startsWith("p")?"#38bdf8":tp?.startsWith("o")?"#f59e0b":"#64748b";

  // ── css ──────────────────────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
    @keyframes fadeUp   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
    @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
    @keyframes spin     { to{transform:rotate(360deg)} }
    @keyframes shimmer  { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    @keyframes float    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
    @keyframes flip     { 0%{transform:perspective(700px) rotateY(180deg) scale(.85);opacity:0} 100%{transform:perspective(700px) rotateY(0) scale(1);opacity:1} }
    @keyframes slideIn  { from{transform:translateX(110%);opacity:0} to{transform:none;opacity:1} }
    .page { animation: fadeUp .3s ease both; }
    .card-grid { display:flex; flex-wrap:wrap; gap:16px; }
    @media(max-width:640px){ .card-grid{gap:10px;} }
  `;

  const F  = "'Inter', -apple-system, sans-serif";
  const FM = "'JetBrains Mono', monospace";

  // ── landing ──────────────────────────────────────────────────────────────────
  if(!connected) return (
    <div style={{minHeight:"100vh",background:"#020817",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:F,position:"relative",overflow:"hidden"}}>
      <style>{css}</style>
      {/* subtle bg glow */}
      <div style={{position:"absolute",top:"30%",left:"50%",transform:"translate(-50%,-50%)",width:600,height:600,borderRadius:"50%",background:"radial-gradient(circle,rgba(14,165,233,.07),transparent 70%)",pointerEvents:"none"}}/>
      <div style={{position:"relative",zIndex:1,textAlign:"center",animation:"fadeUp .7s ease"}}>
        <div style={{fontSize:80,animation:"float 4s ease-in-out infinite",marginBottom:20}}>🐋</div>
        <h1 style={{fontSize:52,fontWeight:800,background:"linear-gradient(135deg,#38bdf8,#818cf8,#38bdf8)",backgroundSize:"200%",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"shimmer 4s linear infinite",letterSpacing:-2,lineHeight:1.1,marginBottom:12}}>WHALEMON</h1>
        <p style={{fontSize:14,color:"#475569",letterSpacing:6,textTransform:"uppercase",marginBottom:40}}>Trading Card Game</p>
        <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:40,flexWrap:"wrap"}}>
          {ELEMENTS.map((e,i)=>(
            <span key={i} style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${e.color}40`,color:e.color,fontSize:13,background:`${e.color}0d`}}>{e.icon} {e.name}</span>
          ))}
        </div>
        <button onClick={handleConnect} style={{padding:"15px 48px",borderRadius:12,background:"linear-gradient(135deg,#0ea5e9,#6366f1)",border:"none",color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:F,letterSpacing:.3,boxShadow:"0 4px 32px rgba(14,165,233,.35)",transition:"transform .15s,box-shadow .15s"}}
          onMouseEnter={o=>{o.currentTarget.style.transform="scale(1.03)";o.currentTarget.style.boxShadow="0 6px 40px rgba(14,165,233,.5)";}}
          onMouseLeave={o=>{o.currentTarget.style.transform="none";o.currentTarget.style.boxShadow="0 4px 32px rgba(14,165,233,.35)";}}>
          Connect Wallet
        </button>
        <p style={{marginTop:12,fontSize:13,color:"#334155"}}>Tempo Network · Gas in PATHUSD</p>
        <div style={{marginTop:56,display:"flex",gap:40,justifyContent:"center"}}>
          {[["3,333","Whales"],["6","Elements"],["∞","Battles"]].map(([v,l],i)=>(
            <div key={i} style={{textAlign:"center"}}>
              <div style={{fontSize:30,fontWeight:800,color:"#f1f5f9",lineHeight:1}}>{v}</div>
              <div style={{fontSize:12,color:"#475569",textTransform:"uppercase",letterSpacing:2,marginTop:4}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── app shell ────────────────────────────────────────────────────────────────
  const NavBtn = ({label,icon,id})=>(
    <button onClick={()=>{setPage(id);setPicked(null);}} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:8,border:"none",background:page===id?"rgba(14,165,233,.12)":"transparent",color:page===id?"#38bdf8":"#64748b",fontSize:14,fontWeight:page===id?700:500,cursor:"pointer",fontFamily:F,transition:"all .15s"}}
      onMouseEnter={o=>{if(page!==id) o.currentTarget.style.color="#94a3b8";}}
      onMouseLeave={o=>{if(page!==id) o.currentTarget.style.color="#64748b";}}>
      <span style={{fontSize:16}}>{icon}</span>{label}
    </button>
  );

  return (
    <div style={{minHeight:"100vh",background:"#020817",fontFamily:F,display:"flex",flexDirection:"column"}}>
      <style>{css}</style>

      {/* toast */}
      {notif && <div style={{position:"fixed",top:16,right:16,zIndex:2000,padding:"12px 18px",borderRadius:10,
        background:notif.t==="err"?"#450a0a":notif.t==="info"?"#0c1a2e":"#042f1e",
        border:`1px solid ${notif.t==="err"?"#f8717130":notif.t==="info"?"#38bdf830":"#4ade8030"}`,
        color:"#f1f5f9",fontSize:14,animation:"slideIn .25s ease",boxShadow:"0 8px 32px rgba(0,0,0,.5)",maxWidth:320}}>{notif.m}</div>}

      {/* reveal overlay */}
      {revealPhase && (
        <div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(2,8,23,.92)",backdropFilter:"blur(16px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeIn .3s"}}>
          {revealPhase==="done" && <button onClick={()=>{setRevealCard(null);setRevealPhase(null);}} style={{position:"absolute",top:20,right:20,background:"rgba(255,255,255,.08)",border:"1px solid #1e293b",borderRadius:8,color:"#94a3b8",padding:"8px 16px",cursor:"pointer",fontFamily:F,fontSize:14}}>Close ✕</button>}
          {(revealPhase==="minting"||revealPhase==="generating") && (
            <div style={{textAlign:"center",animation:"fadeUp .4s"}}>
              <div style={{width:80,height:80,borderRadius:"50%",background:"rgba(14,165,233,.08)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",position:"relative"}}>
                <div style={{position:"absolute",inset:-3,border:"2px solid transparent",borderTop:"2px solid #0ea5e9",borderRadius:"50%",animation:"spin 1.2s linear infinite"}}/>
                <span style={{fontSize:34}}>🐋</span>
              </div>
              <div style={{fontSize:20,fontWeight:700,color:"#f1f5f9"}}>{revealPhase==="minting"?"Minting on Tempo…":"Oracle generating stats…"}</div>
              <div style={{fontSize:14,color:"#475569",marginTop:6}}>{revealPhase==="minting"?"Confirm in MetaMask":"AI analysing your whale traits"}</div>
            </div>
          )}
          {revealPhase==="done" && revealCard && (
            <div style={{textAlign:"center",animation:"flip .6s ease"}}>
              <Card card={revealCard} size="lg"/>
              <div style={{marginTop:20,fontSize:20,fontWeight:700,color:el(revealCard.element).color}}>{el(revealCard.element).icon} {RARITIES[revealCard.rarity]} {el(revealCard.element).name}!</div>
              <button onClick={()=>{setRevealCard(null);setRevealPhase(null);setPage("cards");}} style={{marginTop:16,padding:"12px 32px",borderRadius:10,background:"linear-gradient(135deg,#0ea5e9,#6366f1)",border:"none",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:F}}>View My Cards →</button>
            </div>
          )}
        </div>
      )}

      {/* header */}
      <header style={{position:"sticky",top:0,zIndex:100,background:"rgba(2,8,23,.85)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(255,255,255,.05)",padding:"0 24px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:22}}>🐋</span>
          <span style={{fontSize:16,fontWeight:800,color:"#f1f5f9",letterSpacing:-.3}}>WHALEMON</span>
          <span style={{fontSize:11,color:"#0ea5e9",letterSpacing:2,fontFamily:FM}}>TCG</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:20,background:"rgba(14,165,233,.08)",border:"1px solid rgba(14,165,233,.2)",fontSize:13,color:"#38bdf8"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#4ade80"}}/>Tempo
          </div>
          <div style={{padding:"5px 12px",borderRadius:20,background:"rgba(74,222,128,.08)",border:"1px solid rgba(74,222,128,.2)",fontSize:14,color:"#4ade80",fontWeight:700,fontFamily:FM}}>${balance}</div>
          <div style={{padding:"5px 12px",borderRadius:20,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)",fontSize:13,color:"#94a3b8",fontFamily:FM}}>{addr.slice(0,6)}…{addr.slice(-4)}</div>
          <button onClick={handleDisconnect} style={{padding:"5px 12px",borderRadius:20,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",color:"#f87171",fontSize:13,cursor:"pointer",fontFamily:F,fontWeight:600}}>Disconnect</button>
        </div>
      </header>

      {/* nav */}
      <nav style={{background:"rgba(2,8,23,.6)",borderBottom:"1px solid rgba(255,255,255,.04)",padding:"0 24px",display:"flex",gap:4,overflowX:"auto"}}>
        <NavBtn label="My Whales"   icon="🐋" id="whales"/>
        <NavBtn label="My Cards"    icon="🃏" id="cards"/>
        <NavBtn label="Battle"      icon="⚔️" id="battle"/>
        <NavBtn label="Marketplace" icon="🏪" id="market"/>
        <NavBtn label="Leaderboard" icon="🏆" id="leaderboard"/>
      </nav>

      {/* main */}
      <main style={{flex:1,padding:"28px 24px",maxWidth:1200,width:"100%",margin:"0 auto"}}>

        {/* ── WHALES ── */}
        {page==="whales" && (
          <div className="page">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
              <div>
                <h2 style={{fontSize:24,fontWeight:700,color:"#f1f5f9",marginBottom:6}}>My Whales</h2>
                <p style={{fontSize:14,color:"#64748b"}}>Generate one Whalemon card per WHEL NFT — free, gas only.</p>
              </div>
              <button onClick={()=>{loadWhales();loadCards();}} style={{padding:"8px 18px",borderRadius:10,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",color:"#94a3b8",fontSize:14,cursor:"pointer",fontFamily:F,fontWeight:600}}>↻ Refresh</button>
            </div>

            {loadingW && <div style={{textAlign:"center",padding:60,color:"#475569"}}>
              <div style={{width:32,height:32,border:"2px solid rgba(14,165,233,.2)",borderTop:"2px solid #0ea5e9",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/>
              <div style={{fontSize:15}}>Loading your WHEL NFTs…</div>
            </div>}

            {!loadingW && whales.length===0 && (
              <div style={{textAlign:"center",padding:80,color:"#334155"}}>
                <div style={{fontSize:48,marginBottom:16}}>🐋</div>
                <div style={{fontSize:18,color:"#475569",fontWeight:600,marginBottom:8}}>No WHEL NFTs found</div>
                <div style={{fontSize:14,color:"#334155"}}>Make sure MetaMask is on Tempo Network and you hold WHEL NFTs.</div>
                <button onClick={loadWhales} style={{marginTop:20,padding:"10px 24px",borderRadius:10,background:"linear-gradient(135deg,#0ea5e9,#6366f1)",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F}}>Try Again</button>
              </div>
            )}

            <div className="card-grid">
              {whales.map(w=>(
                <div key={w.id} style={{width:190,borderRadius:14,background:"#0a0e1f",border:"1px solid #1e293b",overflow:"hidden",transition:"transform .18s"}}>
                  <div style={{height:220,background:"linear-gradient(135deg,#0c4a6e,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                      <img src={w.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover",position:"absolute",inset:0}} onError={o=>{o.target.style.display="none";o.target.nextSibling.style.display="block";}}/>
                      <span style={{fontSize:48,position:"relative",zIndex:1,display:"none"}}>🐋</span>
                    <div style={{position:"absolute",top:8,left:8,padding:"3px 8px",borderRadius:6,background:"rgba(0,0,0,.6)",fontSize:12,color:"#f1f5f9",fontWeight:700,fontFamily:FM}}>#{w.id}</div>
                  </div>
                  <div style={{padding:12}}>
                    {mintedIds.has(w.id)
                      ? <div style={{padding:"8px 0",textAlign:"center",fontSize:13,color:"#4ade80",fontWeight:600,borderRadius:8,background:"rgba(74,222,128,.06)",border:"1px solid rgba(74,222,128,.15)"}}>✓ Card Minted</div>
                      : <button onClick={()=>handleMint(w.id)} disabled={minting===w.id} style={{width:"100%",padding:"9px 0",borderRadius:9,background:minting===w.id?"#1e293b":"linear-gradient(135deg,#0ea5e9,#6366f1)",border:"none",color:minting===w.id?"#475569":"#fff",fontSize:14,fontWeight:700,cursor:minting===w.id?"not-allowed":"pointer",fontFamily:F}}>
                          {minting===w.id?"Minting…":"⚡ Generate Card"}
                        </button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CARDS ── */}
        {page==="cards" && (
          <div className="page">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
              <div>
                <h2 style={{fontSize:24,fontWeight:700,color:"#f1f5f9",marginBottom:6}}>My Cards</h2>
                <p style={{fontSize:14,color:"#64748b"}}>Your battle-ready Whalemon cards.</p>
              </div>
              <button onClick={loadCards} style={{padding:"8px 18px",borderRadius:10,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",color:"#94a3b8",fontSize:14,cursor:"pointer",fontFamily:F,fontWeight:600}}>↻ Refresh</button>
            </div>

            {loadingC && <div style={{textAlign:"center",padding:60,color:"#475569"}}>
              <div style={{width:32,height:32,border:"2px solid rgba(14,165,233,.2)",borderTop:"2px solid #0ea5e9",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/>
              <div style={{fontSize:15}}>Loading cards…</div>
            </div>}

            {!loadingC && cards.length===0 && (
              <div style={{textAlign:"center",padding:80,color:"#334155"}}>
                <div style={{fontSize:48,marginBottom:16}}>🃏</div>
                <div style={{fontSize:18,color:"#475569",fontWeight:600,marginBottom:8}}>No cards yet</div>
                <div style={{fontSize:14,color:"#334155"}}>Generate cards from your WHEL NFTs first.</div>
                <button onClick={()=>setPage("whales")} style={{marginTop:20,padding:"10px 24px",borderRadius:10,background:"linear-gradient(135deg,#0ea5e9,#6366f1)",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F}}>Go to My Whales →</button>
              </div>
            )}

            <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
              <div className="card-grid" style={{flex:1}}>
                {cards.map(c=><Card key={c.id} card={c} onClick={()=>setPicked(c)}/>)}
              </div>
             {picked && (
                  <div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(0,0,0,.88)",backdropFilter:"blur(16px)",display:"flex",alignItems:"flex-start",justifyContent:"center",animation:"fadeIn .2s",padding:"60px 20px 20px"}} onClick={()=>setPicked(null)}>
                    <div style={{background:"#0f172a",borderRadius:20,border:"1px solid #1e293b",maxWidth:800,width:"100%",maxHeight:"90vh",overflowY:"auto",animation:"fadeUp .25s"}} onClick={e=>e.stopPropagation()}>
                      {/* Close button */}
                      <div style={{display:"flex",justifyContent:"flex-end",padding:"16px 20px 0"}}>
                        <button onClick={()=>setPicked(null)} style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,color:"#94a3b8",cursor:"pointer",fontSize:14,padding:"6px 14px",fontFamily:F}}>✕ Close</button>
                      </div>
                      {/* Two-column layout */}
                      <div style={{display:"flex",gap:0,flexWrap:"wrap"}}>
                        {/* Left: Large artwork */}
                        <div style={{flex:"1 1 340px",minWidth:280,padding:20}}>
                          <div style={{borderRadius:14,overflow:"hidden",background:`linear-gradient(${el(picked.element).grad})`,aspectRatio:"3/4",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                            {picked.image
                              ? <img src={picked.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover",position:"absolute",inset:0}}/>
                              : <span style={{fontSize:80}}>🐋</span>}
                          </div>
                        </div>
                        {/* Right: Details + Actions */}
                        <div style={{flex:"1 1 340px",minWidth:280,padding:"20px 24px 24px 4px"}}>
                          {/* Title */}
                          <div style={{marginBottom:4}}>
                            <span style={{fontSize:13,color:el(picked.element).color,fontWeight:600}}>{el(picked.element).icon} {el(picked.element).name}</span>
                          </div>
                          <h2 style={{fontSize:28,fontWeight:800,color:"#f1f5f9",marginBottom:4}}>Whalemon #{picked.id}</h2>
                          <div style={{fontSize:14,color:RARITY_COLORS[picked.rarity],fontWeight:600,marginBottom:20}}>★ {RARITIES[picked.rarity]}</div>
                          {/* Stats */}
                          <div style={{padding:16,borderRadius:12,background:"#0a0e1f",border:"1px solid #1e293b",marginBottom:16}}>
                            <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Stats</div>
                            <StatBar label="ATK" value={picked.attack} max={100} color="#f87171"/>
                            <StatBar label="DEF" value={picked.defense} max={100} color="#60a5fa"/>
                            <StatBar label="HP" value={picked.health} max={300} color="#4ade80"/>
                            <StatBar label="SPD" value={picked.speed} max={100} color="#facc15"/>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,paddingTop:10,borderTop:"1px solid #1e293b"}}>
                              <span style={{fontSize:12,color:"#475569",textTransform:"uppercase",letterSpacing:1}}>Total Power</span>
                              <span style={{fontSize:24,fontWeight:800,color:"#f1f5f9",fontFamily:FM}}>{picked.attack+picked.defense+Math.floor(picked.health/3)+picked.speed}</span>
                            </div>
                          </div>
                          {/* Ability */}
                          <div style={{padding:14,borderRadius:12,background:`${el(picked.element).color}0d`,border:`1px solid ${el(picked.element).color}20`,marginBottom:20}}>
                            <div style={{fontSize:14,fontWeight:700,color:el(picked.element).color,marginBottom:2}}>{picked.ability||"Ocean Strike"}</div>
                            <div style={{fontSize:13,color:"#94a3b8"}}>{picked.abilityDesc||"A powerful ocean attack."}</div>
                          </div>
                          {/* Action buttons */}
                          <div style={{display:"flex",flexDirection:"column",gap:10}}>
                            <button onClick={()=>{toast("List feature coming soon!");}} style={{width:"100%",padding:"14px",borderRadius:12,background:"linear-gradient(135deg,#0ea5e9,#6366f1)",border:"none",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:F}}>List for Sale</button>
                            <div style={{display:"flex",gap:10}}>
                              <button onClick={()=>{toast("Send feature coming soon!");}} style={{flex:1,padding:"12px",borderRadius:12,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",color:"#e2e8f0",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:F}}>Send to Wallet</button>
                              <button onClick={()=>{toast("Offers feature coming soon!");}} style={{flex:1,padding:"12px",borderRadius:12,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",color:"#e2e8f0",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:F}}>View Offers</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}
          {/* ── BATTLE ── */}
        {page==="battle" && (
          <div className="page">
            {!bState && (
              <div style={{textAlign:"center",paddingTop:40}}>
                <div style={{fontSize:56,marginBottom:20}}>⚔️</div>
                <h2 style={{fontSize:26,fontWeight:700,color:"#f1f5f9",marginBottom:10}}>Battle Arena</h2>
                <p style={{fontSize:15,color:"#64748b",maxWidth:400,margin:"0 auto 32px"}}>Ranked matches cost 1 PATHUSD entry. Prize pool split each season.</p>
                <div style={{display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap"}}>
                  {[{m:"free",ic:"🎯",t:"Practice",d:"vs AI · Free",c:"#22c55e"},
                    {m:"ranked-ai",ic:"🤖",t:"Ranked AI",d:"vs AI · 1 PATHUSD",c:"#0ea5e9"},
                    {m:"pvp",ic:"👥",t:"Ranked PvP",d:"vs Player · 1 PATHUSD",c:"#8b5cf6"}].map(x=>(
                    <button key={x.m} onClick={()=>startBattle(x.m)} style={{width:170,padding:"22px 20px",borderRadius:14,background:"#0a0e1f",border:`1px solid ${x.c}25`,cursor:"pointer",textAlign:"center",transition:"all .2s",fontFamily:F}}
                      onMouseEnter={o=>{o.currentTarget.style.borderColor=x.c;o.currentTarget.style.transform="translateY(-3px)";}}
                      onMouseLeave={o=>{o.currentTarget.style.borderColor=`${x.c}25`;o.currentTarget.style.transform="none";}}>
                      <div style={{fontSize:28,marginBottom:8}}>{x.ic}</div>
                      <div style={{fontSize:15,fontWeight:700,color:"#f1f5f9",marginBottom:4}}>{x.t}</div>
                      <div style={{fontSize:13,color:"#64748b"}}>{x.d}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {bState==="select" && (
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                  <div><h2 style={{fontSize:22,fontWeight:700,color:"#f1f5f9"}}>Choose Your Whalemon</h2><p style={{fontSize:14,color:"#64748b",marginTop:4}}>{bMode==="free"?"Practice (free)":"Ranked — 1 PATHUSD"}</p></div>
                  <button onClick={exitBattle} style={{padding:"8px 18px",borderRadius:10,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",color:"#94a3b8",fontSize:14,cursor:"pointer",fontFamily:F,fontWeight:600}}>← Back</button>
                </div>
                {cards.length===0
                  ? <div style={{textAlign:"center",padding:60,color:"#475569",fontSize:15}}>No cards yet — <button onClick={()=>{exitBattle();setPage("whales");}} style={{color:"#0ea5e9",background:"none",border:"none",cursor:"pointer",fontFamily:F,fontSize:15}}>generate cards first →</button></div>
                  : <div className="card-grid">{cards.map(c=><Card key={c.id} card={c} onClick={()=>pickCard(c)}/>)}</div>}
              </div>
            )}

            {bState==="fight" && pCard && oCard && (
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <span style={{fontSize:14,color:"#475569"}}>Turn {bTurn} · {bMode==="free"?"Practice":bMode==="ranked-ai"?"Ranked AI":"PvP"}</span>
                  <button onClick={exitBattle} style={{padding:"7px 16px",borderRadius:8,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",color:"#94a3b8",fontSize:13,cursor:"pointer",fontFamily:F,fontWeight:600}}>{bResult?"Exit":"Forfeit"}</button>
                </div>
                <div style={{display:"flex",gap:16,justifyContent:"center",flexWrap:"wrap",marginBottom:20}}>
                  {[{lbl:"YOUR WHALEMON",c:pCard,clr:"#4ade80"},null,{lbl:bMode==="pvp"?"OPPONENT":"AI OPPONENT",c:oCard,clr:"#f87171"}].map((s,i)=>{
                    if(!s) return <div key={i} style={{display:"flex",alignItems:"center",fontSize:18,fontWeight:800,color:"#1e293b"}}>VS</div>;
                    const hp=Math.max(0,s.c.hp??s.c.health),pct=hp/s.c.health;
                    return <div key={i} style={{flex:"1 1 260px",maxWidth:300,background:"#0a0e1f",borderRadius:14,border:`1px solid ${el(s.c.element).color}25`,padding:16}}>
                      <div style={{fontSize:12,color:s.clr,fontWeight:700,marginBottom:10}}>{s.lbl}</div>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                        <div style={{width:44,height:44,borderRadius:10,overflow:"hidden",background:`linear-gradient(${el(s.c.element).grad})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🐋</div>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#64748b",marginBottom:4}}><span>HP</span><span style={{fontFamily:FM}}>{hp}/{s.c.health}</span></div>
                          <div style={{height:8,background:"#1e293b",borderRadius:4,overflow:"hidden"}}><div style={{width:`${pct*100}%`,height:"100%",background:pct>.5?"#4ade80":pct>.2?"#facc15":"#ef4444",borderRadius:4,transition:"width .4s"}}/></div>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4}}>
                        {[["ATK",s.c.attack,"#f87171"],["DEF",s.c.defense,"#60a5fa"],["SPD",s.c.speed,"#facc15"],["RAR",RARITIES[s.c.rarity]?.[0],RARITY_COLORS[s.c.rarity]]].map(([l,v,c])=>(
                          <div key={l} style={{textAlign:"center",padding:"4px 0"}}>
                            <div style={{fontSize:10,color:"#475569"}}>{l}</div>
                            <div style={{fontSize:13,color:c,fontWeight:700,fontFamily:FM}}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>;
                  })}
                </div>
                {!bResult && <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                  {[["⚔️ Attack","atk","linear-gradient(135deg,#dc2626,#b91c1c)"],
                    [`🌀 ${pCard.ability}${bCd>0?` (${bCd})`:""}` ,"ab","linear-gradient(135deg,#7c3aed,#5b21b6)",bCd>0],
                    ["🛡️ Defend","def","linear-gradient(135deg,#0ea5e9,#0284c7)"]].map(([lbl,mv,bg,dis])=>(
                    <button key={mv} onClick={()=>doMove(mv)} disabled={!!dis} style={{padding:"12px 22px",borderRadius:10,background:dis?"#1e293b":bg,border:"none",color:dis?"#475569":"#fff",fontSize:14,fontWeight:700,cursor:dis?"not-allowed":"pointer",fontFamily:F}}>{lbl}</button>
                  ))}
                </div>}
                {bResult && <div style={{textAlign:"center",padding:"20px 28px",borderRadius:14,background:bResult==="win"?"rgba(74,222,128,.06)":bResult==="lose"?"rgba(239,68,68,.06)":"rgba(255,255,255,.03)",border:`1px solid ${bResult==="win"?"rgba(74,222,128,.2)":bResult==="lose"?"rgba(239,68,68,.2)":"rgba(255,255,255,.06)"}`,marginTop:20,animation:"fadeUp .3s"}}>
                  <div style={{fontSize:44}}>{bResult==="win"?"🏆":bResult==="lose"?"💀":"🤝"}</div>
                  <div style={{fontSize:22,fontWeight:800,color:bResult==="win"?"#4ade80":bResult==="lose"?"#f87171":"#94a3b8",marginTop:8}}>{bResult==="win"?"VICTORY!":bResult==="lose"?"DEFEATED":"DRAW"}</div>
                  <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:16}}>
                    <button onClick={()=>{exitBattle();startBattle(bMode);}} style={{padding:"10px 24px",borderRadius:10,background:"linear-gradient(135deg,#0ea5e9,#6366f1)",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F}}>Play Again</button>
                    <button onClick={exitBattle} style={{padding:"10px 24px",borderRadius:10,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",color:"#94a3b8",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:F}}>Exit</button>
                  </div>
                </div>}
                <div style={{marginTop:20,padding:14,borderRadius:12,background:"#0a0e1f",border:"1px solid #1e293b",maxHeight:160,overflowY:"auto"}}>
                  <div style={{fontSize:11,color:"#334155",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Battle Log</div>
                  {bLog.map((l,i)=><div key={i} style={{fontSize:13,padding:"2px 0 2px 8px",color:logColor(l.tp),borderLeft:`2px solid ${logColor(l.tp)}30`,marginBottom:2}}>{l.s}</div>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MARKETPLACE ── */}
        {page==="market" && (
          <div className="page" style={{textAlign:"center",paddingTop:60}}>
            <div style={{fontSize:56,marginBottom:20}}>🏪</div>
            <h2 style={{fontSize:24,fontWeight:700,color:"#f1f5f9",marginBottom:10}}>Marketplace</h2>
            <p style={{fontSize:15,color:"#64748b",marginBottom:24}}>Card trading coming soon. Contracts are deployed and ready.</p>
            <div style={{display:"inline-block",padding:"12px 20px",borderRadius:12,background:"#0a0e1f",border:"1px solid #1e293b"}}>
              <div style={{fontSize:12,color:"#475569",marginBottom:4}}>Marketplace Contract</div>
              <div style={{fontSize:13,color:"#38bdf8",fontFamily:FM}}>{CONTRACTS.MARKETPLACE}</div>
            </div>
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {page==="leaderboard" && (
          <div className="page" style={{textAlign:"center",paddingTop:60}}>
            <div style={{fontSize:56,marginBottom:20}}>🏆</div>
            <h2 style={{fontSize:24,fontWeight:700,color:"#f1f5f9",marginBottom:10}}>Leaderboard</h2>
            <p style={{fontSize:15,color:"#64748b"}}>Season 1 starts once ranked battles begin. Be the first to climb!</p>
          </div>
        )}

      </main>

      <footer style={{borderTop:"1px solid rgba(255,255,255,.04)",padding:"16px 24px",display:"flex",justifyContent:"space-between",fontSize:13,color:"#1e293b"}}>
        <span>Whalemon TCG</span>
        <span style={{fontFamily:FM}}>Tempo · PATHUSD · Chain 4217</span>
      </footer>
    </div>
  );
}
