/**
 * Avaliação de risco do login — mesma regra do SIMDASH (auth/login-risk.ts).
 * Só marca o login como suspeito para a auditoria; não bloqueia a entrada.
 *
 * Motivos: dispositivo novo, login sem localização, local a mais de
 * LOGIN_DISTANCIA_SUSPEITA_KM (padrão 300 km) de todos os logins anteriores e
 * deslocamento impossível (mais de 900 km/h desde o último login com local).
 */
export interface LoginParaAvaliar {
  fingerprint: string;
  latitude: number | null;
  longitude: number | null;
  data: Date;
}

export interface LoginAnterior {
  fingerprint: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
}

export interface ResultadoRisco {
  suspeito: boolean;
  motivos: string[];
  distanciaKm: number | null;
}

const VELOCIDADE_MAXIMA_KMH = 900;
const DISTANCIA_MINIMA_DESLOCAMENTO_KM = 100;

export const MOTIVO_TOKEN_OUTRO_DISPOSITIVO = 'Token usado em outro dispositivo';
export const SEPARADOR_MOTIVOS = ' · ';

export function limiteDistanciaKm(): number {
  const v = Number(process.env.LOGIN_DISTANCIA_SUSPEITA_KM);
  return Number.isFinite(v) && v > 0 ? v : 300;
}

/** Distância em linha reta (haversine), em km. */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const temCoords = (l: { latitude: number | null; longitude: number | null }) =>
  l.latitude !== null && l.longitude !== null && Number.isFinite(l.latitude) && Number.isFinite(l.longitude);

/** `anteriores` em ordem do mais recente para o mais antigo. */
export function avaliarRiscoLogin(novo: LoginParaAvaliar, anteriores: LoginAnterior[]): ResultadoRisco {
  if (anteriores.length === 0) return { suspeito: false, motivos: [], distanciaKm: null };

  const motivos: string[] = [];
  let distanciaMinima: number | null = null;

  if (!anteriores.some((a) => a.fingerprint === novo.fingerprint)) motivos.push('Dispositivo novo');

  if (!temCoords(novo)) {
    motivos.push('Login sem localização');
  } else {
    const comCoords = anteriores.filter(temCoords);
    if (comCoords.length > 0) {
      const lat = novo.latitude as number;
      const lon = novo.longitude as number;
      distanciaMinima = Math.min(
        ...comCoords.map((a) => distanciaKm(lat, lon, a.latitude as number, a.longitude as number)),
      );
      if (distanciaMinima > limiteDistanciaKm()) {
        motivos.push(`Local a ${Math.round(distanciaMinima)} km dos logins anteriores`);
      }

      const ultimo = comCoords[0];
      const dist = distanciaKm(lat, lon, ultimo.latitude as number, ultimo.longitude as number);
      const horas = Math.max((novo.data.getTime() - ultimo.createdAt.getTime()) / 3_600_000, 1 / 60);
      if (dist > DISTANCIA_MINIMA_DESLOCAMENTO_KM && dist / horas > VELOCIDADE_MAXIMA_KMH) {
        const tempo = horas < 1 ? `${Math.round(horas * 60)} min` : `${horas.toFixed(1).replace('.', ',')} h`;
        motivos.push(`Deslocamento impossível (${Math.round(dist)} km em ${tempo})`);
      }
    }
  }

  return { suspeito: motivos.length > 0, motivos, distanciaKm: distanciaMinima };
}
