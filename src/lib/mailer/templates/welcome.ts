import { BRAND_SOCIAL } from '../brand.js';
import {
  BRAND_EMAIL,
  BRAND_EMAIL_FONT,
  absoluteUrl,
  renderBrandCta,
  renderBrandEmailShell,
} from '../layout.js';

/**
 * Registration welcome — black top bar with the live white ODI logo,
 * then the white body + blue CTA.
 */
export function welcomeEmail(_opts: { name?: string | null; email?: string }) {
  const home = absoluteUrl('/');
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;

  const bodyHtml = `
              <h1 style="margin:0 0 28px;font-family:${FONT};font-size:34px;line-height:1.2;font-weight:700;color:${C.ink};">
                Welcome to ODI.
              </h1>

              <p style="margin:0 0 22px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body};">
                Your account is ready, and you're now part of the world of ODI. We create books, learning experiences, and creative products that bring together design, exploration, and curiosity. Alongside our own work, ODI also offers 3D stereo services, helping bring depth, dimension, and a more immersive visual experience to creative and professional projects. Every project is made with a focus on thoughtful design, clear ideas, and experiences that invite people to look closer.
              </p>

              <p style="margin:0 0 36px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body};">
                Take a look around and explore what we've been creating. From thoughtfully designed books and learning experiences to 3D stereo work and visual ideas, ODI is built around the belief that things can be understood better when they can be seen and experienced in new ways. We're glad to have you here, and we hope you find something that sparks your curiosity.
              </p>

              ${renderBrandCta(home, 'Explore ODI Studio')}`;

  const html = renderBrandEmailShell({
    title: 'Welcome to ODI',
    preheader: 'Your account is ready. Welcome to ODI.',
    bodyHtml,
  });

  const text = [
    'Welcome to ODI.',
    '',
    "Your account is ready, and you're now part of the world of ODI. We create books, learning experiences, and creative products that bring together design, exploration, and curiosity. Alongside our own work, ODI also offers 3D stereo services, helping bring depth, dimension, and a more immersive visual experience to creative and professional projects. Every project is made with a focus on thoughtful design, clear ideas, and experiences that invite people to look closer.",
    '',
    "Take a look around and explore what we've been creating. From thoughtfully designed books and learning experiences to 3D stereo work and visual ideas, ODI is built around the belief that things can be understood better when they can be seen and experienced in new ways. We're glad to have you here, and we hope you find something that sparks your curiosity.",
    '',
    `Explore ODI Studio: ${home}`,
    '',
    BRAND_SOCIAL.map((s) => `${s.label}: ${s.href}`).join('\n'),
    '',
    `— ODI Studio`,
  ].join('\n');

  return { subject: 'Welcome to ODI', html, text };
}
