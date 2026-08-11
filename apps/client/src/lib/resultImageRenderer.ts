import {
  formatMatchDuration,
  type ShareableMatchResult,
  type ShareableMatchResultPlayer
} from "./matchResults.js";

const WIDTH = 1080;
const HEIGHT = 1350;

export async function renderMatchResultImage(result: ShareableMatchResult): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image rendering is not supported in this browser.");

  drawBackground(context);
  drawBrand(context, result.publicMatchId);
  drawHeading(context, result);

  const avatarImages = await Promise.all(result.players.map((player) => loadAvatar(player.avatarUrl)));
  drawPlayers(context, result.players, avatarImages);
  drawStats(context, result);
  drawFooter(context);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The result image could not be generated."));
    }, "image/png", 1);
  });
}

function drawBackground(context: CanvasRenderingContext2D): void {
  const base = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  base.addColorStop(0, "#061510");
  base.addColorStop(0.52, "#0b3224");
  base.addColorStop(1, "#07120f");
  context.fillStyle = base;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = context.createRadialGradient(540, 520, 40, 540, 520, 700);
  glow.addColorStop(0, "rgba(42, 210, 143, 0.24)");
  glow.addColorStop(0.55, "rgba(22, 111, 77, 0.08)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.save();
  context.globalAlpha = 0.09;
  context.strokeStyle = "#f3cf6b";
  context.lineWidth = 1;
  for (let x = -HEIGHT; x < WIDTH + HEIGHT; x += 52) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + HEIGHT, HEIGHT);
    context.stroke();
  }
  context.restore();

  roundedRect(context, 44, 44, WIDTH - 88, HEIGHT - 88, 54);
  context.strokeStyle = "rgba(244, 205, 105, 0.55)";
  context.lineWidth = 3;
  context.stroke();
  roundedRect(context, 58, 58, WIDTH - 116, HEIGHT - 116, 46);
  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 2;
  context.stroke();
}

function drawBrand(context: CanvasRenderingContext2D, publicMatchId: string): void {
  const crest = context.createLinearGradient(80, 74, 176, 170);
  crest.addColorStop(0, "#2ed79b");
  crest.addColorStop(1, "#f0c75e");
  roundedRect(context, 80, 76, 98, 98, 28);
  context.fillStyle = crest;
  context.fill();
  context.fillStyle = "#061510";
  context.font = "900 40px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("BT", 129, 126);

  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#f7f5ec";
  context.font = "900 34px Inter, Arial, sans-serif";
  context.fillText("BHABHI THULLA", 204, 113);
  context.fillStyle = "#6ee7bb";
  context.font = "800 18px Inter, Arial, sans-serif";
  context.letterSpacing = "4px";
  context.fillText("ONLINE CARD ARENA", 204, 148);
  context.letterSpacing = "0px";

  context.textAlign = "right";
  context.fillStyle = "rgba(255,255,255,0.58)";
  context.font = "700 18px Inter, Arial, sans-serif";
  context.fillText("RESULT ID", 996, 108);
  context.fillStyle = "#f2cb68";
  context.font = "900 28px Inter, Arial, sans-serif";
  context.fillText(publicMatchId, 996, 143);
}

function drawHeading(context: CanvasRenderingContext2D, result: ShareableMatchResult): void {
  context.textAlign = "center";
  context.fillStyle = "#f2cb68";
  context.font = "900 20px Inter, Arial, sans-serif";
  context.letterSpacing = "7px";
  context.fillText("MATCH COMPLETE", WIDTH / 2, 238);
  context.letterSpacing = "0px";
  context.fillStyle = "#ffffff";
  context.font = "900 74px Inter, Arial, sans-serif";
  context.fillText("FINAL TABLE RESULT", WIDTH / 2, 322);

  context.fillStyle = "rgba(255,255,255,0.68)";
  context.font = "700 23px Inter, Arial, sans-serif";
  const completed = new Date(result.completedAt).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  context.fillText(`${completed}  /  ${result.gameMode}  /  ${result.roomType}`, WIDTH / 2, 366);

  if (result.tournament) {
    roundedRect(context, 248, 388, 584, 54, 27);
    context.fillStyle = "rgba(241, 199, 91, 0.13)";
    context.fill();
    context.strokeStyle = "rgba(241, 199, 91, 0.34)";
    context.stroke();
    context.fillStyle = "#f4d477";
    context.font = "800 21px Inter, Arial, sans-serif";
    context.fillText(`${result.tournament.name}  /  ${result.tournament.round}`, WIDTH / 2, 423);
  }
}

function drawPlayers(
  context: CanvasRenderingContext2D,
  players: ShareableMatchResultPlayer[],
  avatarImages: Array<HTMLImageElement | undefined>
): void {
  const rowGap = 18;
  const top = 470;
  const available = 548;
  const rowHeight = Math.min(126, Math.max(86, (available - rowGap * Math.max(0, players.length - 1)) / players.length));

  players.forEach((player, index) => {
    const y = top + index * (rowHeight + rowGap);
    const bhabhi = player.becameBhabhi;
    roundedRect(context, 112, y, 856, rowHeight, 30);
    context.fillStyle = bhabhi ? "rgba(244, 92, 116, 0.18)" : index === 0 ? "rgba(242, 203, 104, 0.16)" : "rgba(255,255,255,0.07)";
    context.fill();
    context.strokeStyle = bhabhi ? "rgba(255, 118, 140, 0.7)" : index === 0 ? "rgba(242, 203, 104, 0.62)" : "rgba(255,255,255,0.11)";
    context.lineWidth = bhabhi || index === 0 ? 3 : 2;
    context.stroke();

    drawAvatar(context, player, avatarImages[index], 174, y + rowHeight / 2, Math.min(40, rowHeight * 0.34), bhabhi);
    context.textAlign = "left";
    context.fillStyle = "#ffffff";
    context.font = `900 ${Math.min(34, rowHeight * 0.3)}px Inter, Arial, sans-serif`;
    context.fillText(fitText(context, player.displayName, 410), 246, y + rowHeight * 0.46);
    context.fillStyle = bhabhi ? "#ff879c" : index === 0 ? "#f4d477" : "#77e8be";
    context.font = `800 ${Math.min(20, rowHeight * 0.18)}px Inter, Arial, sans-serif`;
    context.fillText(bhabhi ? "BECAME BHABHI" : index === 0 ? "ESCAPED FIRST" : "ESCAPED", 246, y + rowHeight * 0.72);

    context.textAlign = "right";
    context.fillStyle = bhabhi ? "#ff879c" : index === 0 ? "#f4d477" : "rgba(255,255,255,0.82)";
    context.font = `900 ${Math.min(42, rowHeight * 0.38)}px Inter, Arial, sans-serif`;
    context.fillText(bhabhi ? "BHABHI" : positionLabel(player.finalPosition), 920, y + rowHeight * 0.58);
  });
}

function drawStats(context: CanvasRenderingContext2D, result: ShareableMatchResult): void {
  const y = 1072;
  const stats: Array<[string, string]> = [
    ["PLAYERS", String(result.playerCount)],
    ["DURATION", formatMatchDuration(result.durationSeconds)],
    ["MODE", result.gameMode],
    ["ROUND", result.roundLabel ?? "Final"]
  ];
  const width = 205;
  const gap = 12;
  stats.forEach(([label, value], index) => {
    const x = 112 + index * (width + gap);
    roundedRect(context, x, y, width, 96, 24);
    context.fillStyle = "rgba(0,0,0,0.2)";
    context.fill();
    context.textAlign = "center";
    context.fillStyle = "rgba(255,255,255,0.5)";
    context.font = "800 15px Inter, Arial, sans-serif";
    context.fillText(label, x + width / 2, y + 32);
    context.fillStyle = "#ffffff";
    context.font = "900 22px Inter, Arial, sans-serif";
    context.fillText(fitText(context, value, width - 24), x + width / 2, y + 67);
  });
}

function drawFooter(context: CanvasRenderingContext2D): void {
  context.textAlign = "center";
  context.fillStyle = "rgba(255,255,255,0.48)";
  context.font = "700 20px Inter, Arial, sans-serif";
  context.fillText("Play private tables, smart bots and tournaments", WIDTH / 2, 1230);
  context.fillStyle = "#70e5bb";
  context.font = "900 27px Inter, Arial, sans-serif";
  context.fillText("bhabhi-thulla-alpha.vercel.app", WIDTH / 2, 1270);
}

function drawAvatar(
  context: CanvasRenderingContext2D,
  player: ShareableMatchResultPlayer,
  image: HTMLImageElement | undefined,
  x: number,
  y: number,
  radius: number,
  bhabhi: boolean
): void {
  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  if (image) {
    context.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    const avatar = context.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    avatar.addColorStop(0, bhabhi ? "#ff7891" : "#43dfaa");
    avatar.addColorStop(1, "#e7c351");
    context.fillStyle = avatar;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    context.fillStyle = "#07130f";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `900 ${Math.round(radius * 0.75)}px Inter, Arial, sans-serif`;
    context.fillText(initials(player.displayName), x, y + 1);
  }
  context.restore();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.strokeStyle = bhabhi ? "#ff8298" : "rgba(244, 208, 111, 0.9)";
  context.lineWidth = 4;
  context.stroke();
}

async function loadAvatar(url: string | undefined): Promise<HTMLImageElement | undefined> {
  if (!url) return undefined;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    const timeout = window.setTimeout(() => resolve(undefined), 2500);
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      resolve(undefined);
    };
    image.src = url;
  });
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (context.measureText(value).width <= maxWidth) return value;
  let result = value;
  while (result.length > 1 && context.measureText(`${result}\u2026`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}\u2026`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BT";
}

function positionLabel(position: number): string {
  if (position === 1) return "1ST";
  if (position === 2) return "2ND";
  if (position === 3) return "3RD";
  return `${position}TH`;
}
