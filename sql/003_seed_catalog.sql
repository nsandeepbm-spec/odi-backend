-- ═══════════════════════════════════════════════════════════════════════════
-- ODI · Optional catalog seed (products, images, sample coupon)
-- Run AFTER sql/002_commerce.sql only if you want demo data.
-- Skip this file if you will create products via admin API / dashboard.
--
-- Replace image URLs with your Supabase Storage public URLs after upload.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.products (
  slug, name, volume, description, long_description,
  author, publisher, language, age_range, pages,
  price_paise, compare_at_paise, stock_qty, status, tag,
  features, categories, kit_contents, sort_order
) values
(
  'space-explorer',
  'Space Explorer',
  'Vol. 01',
  'Journey through the cosmos in immersive 3D. A complete interactive kit for kids.',
  'The Space Explorer kit combines a premium stereoscopic fact book, interactive Explorer Cards, cardboard 3D glasses, and stickers. Designed for ages 6–12, it turns learning into a hands-on adventure across planets, stars, and deep-space missions.',
  'ODI Kids Editorial',
  'ODI Stereo Labs',
  'English',
  '6–12 years',
  48,
  129900,
  159900,
  100,
  'live',
  'Bestseller',
  array['3D Glasses Included', 'Interactive Explorer Cards', 'Premium Fact Book', 'Free Shipping'],
  array['space', 'science'],
  '[
    {"name":"Fact Book","qty":1,"detail":"Premium stereoscopic Space Explorer book"},
    {"name":"Explorer Cards","qty":5,"detail":"Interactive 3D discovery cards"},
    {"name":"Cardboard 3D Glasses","qty":1,"detail":"Paper red-cyan viewer"},
    {"name":"Plastic 3D Glasses","qty":1,"detail":"Comfortable reusable frames"},
    {"name":"Sticker Sheet","qty":1,"detail":"Space-themed collectible stickers"}
  ]'::jsonb,
  1
),
(
  'ocean-explorer',
  'Ocean Explorer',
  'Vol. 02',
  'Dive into the deep blue and discover marine life popping right off the page.',
  'Explore coral reefs, whales, and deep-sea creatures in stunning stereoscopic 3D.',
  'ODI Kids Editorial',
  'ODI Stereo Labs',
  'English',
  '6–12 years',
  null,
  129900,
  159900,
  0,
  'coming_soon',
  'Coming Soon',
  array['3D Glasses Included', 'Marine Fact Cards', 'Glow Poster', 'Free Shipping'],
  array['nature', 'science'],
  '[{"name":"Fact Book","qty":1,"detail":"Ocean Explorer stereoscopic book"},{"name":"Explorer Cards","qty":5,"detail":"Interactive 3D discovery cards"},{"name":"3D Glasses","qty":1,"detail":"Included viewer"},{"name":"Sticker Sheet","qty":1,"detail":"Collectible stickers"}]'::jsonb,
  2
),
(
  'dinosaur-explorer',
  'Dinosaur Explorer',
  'Vol. 03',
  'Step back in time and walk with the dinosaurs in stunning stereoscopic depth.',
  'Prehistoric worlds come alive with T-Rex, raptors, and fossil facts in immersive 3D.',
  'ODI Kids Editorial',
  'ODI Stereo Labs',
  'English',
  '6–12 years',
  null,
  129900,
  159900,
  0,
  'coming_soon',
  'Coming Soon',
  array['3D Glasses Included', 'Fossil Guide Cards', 'Sticker Set', 'Free Shipping'],
  array['animals', 'history'],
  '[{"name":"Fact Book","qty":1,"detail":"Dinosaur Explorer stereoscopic book"},{"name":"Explorer Cards","qty":5,"detail":"Interactive 3D discovery cards"},{"name":"3D Glasses","qty":1,"detail":"Included viewer"},{"name":"Sticker Sheet","qty":1,"detail":"Collectible stickers"}]'::jsonb,
  3
),
(
  'human-body',
  'Human Body',
  'Vol. 04',
  'Explore organs, bones, and how the body works — all in eye-popping 3D.',
  'An educational journey through anatomy designed for curious young minds.',
  'ODI Kids Editorial',
  'ODI Stereo Labs',
  'English',
  '8–14 years',
  null,
  129900,
  159900,
  0,
  'coming_soon',
  'Coming Soon',
  array['3D Glasses Included', 'Anatomy Cards', 'Fact Book', 'Free Shipping'],
  array['human-body', 'science'],
  '[{"name":"Fact Book","qty":1,"detail":"Human Body stereoscopic book"},{"name":"Explorer Cards","qty":5,"detail":"Interactive 3D discovery cards"},{"name":"3D Glasses","qty":1,"detail":"Included viewer"},{"name":"Sticker Sheet","qty":1,"detail":"Collectible stickers"}]'::jsonb,
  4
),
(
  'wildlife',
  'Wildlife',
  'Vol. 05',
  'Safari across jungles and savannas — animals leap off every page in 3D.',
  'Meet lions, elephants, and rare species through stereoscopic photography and facts.',
  'ODI Kids Editorial',
  'ODI Stereo Labs',
  'English',
  '6–12 years',
  null,
  129900,
  159900,
  0,
  'coming_soon',
  'Coming Soon',
  array['3D Glasses Included', 'Wildlife Cards', 'Sticker Sheet', 'Free Shipping'],
  array['animals', 'nature'],
  '[{"name":"Fact Book","qty":1,"detail":"Wildlife stereoscopic book"},{"name":"Explorer Cards","qty":5,"detail":"Interactive 3D discovery cards"},{"name":"3D Glasses","qty":1,"detail":"Included viewer"},{"name":"Sticker Sheet","qty":1,"detail":"Collectible stickers"}]'::jsonb,
  5
),
(
  'ancient-egypt',
  'Ancient Egypt',
  'Vol. 06',
  'Walk among pyramids, pharaohs, and tombs in immersive stereoscopic history.',
  'Discover ancient civilizations with 3D scenes, cards, and collectible stickers.',
  'ODI Kids Editorial',
  'ODI Stereo Labs',
  'English',
  '8–14 years',
  null,
  129900,
  159900,
  0,
  'coming_soon',
  'Coming Soon',
  array['3D Glasses Included', 'History Cards', 'Poster Insert', 'Free Shipping'],
  array['history', 'art'],
  '[{"name":"Fact Book","qty":1,"detail":"Ancient Egypt stereoscopic book"},{"name":"Explorer Cards","qty":5,"detail":"Interactive 3D discovery cards"},{"name":"3D Glasses","qty":1,"detail":"Included viewer"},{"name":"Sticker Sheet","qty":1,"detail":"Collectible stickers"}]'::jsonb,
  6
);

-- Primary image placeholders (update URLs to Supabase Storage after upload)
insert into public.product_images (product_id, url, alt, sort_order, is_primary)
select id, '/product-image/4.png', name || ' cover', 0, true
from public.products where slug = 'space-explorer';

insert into public.product_images (product_id, url, alt, sort_order, is_primary)
select id, '/product-image/1.png', name || ' gallery 1', 1, false
from public.products where slug = 'space-explorer';

insert into public.product_images (product_id, url, alt, sort_order, is_primary)
select id, '/Ocean Explorer.png', name || ' cover', 0, true
from public.products where slug = 'ocean-explorer';

insert into public.product_images (product_id, url, alt, sort_order, is_primary)
select id, '/Dinosaur Explorer.png', name || ' cover', 0, true
from public.products where slug = 'dinosaur-explorer';

insert into public.product_images (product_id, url, alt, sort_order, is_primary)
select id, '/Human Body.png', name || ' cover', 0, true
from public.products where slug = 'human-body';

insert into public.product_images (product_id, url, alt, sort_order, is_primary)
select id, '/Wildlife.png', name || ' cover', 0, true
from public.products where slug = 'wildlife';

insert into public.product_images (product_id, url, alt, sort_order, is_primary)
select id, '/Ancient Egypt.png', name || ' cover', 0, true
from public.products where slug = 'ancient-egypt';

-- Sample coupon for testing (10% off, min ₹500)
insert into public.coupons (code, type, value, min_subtotal_paise, max_discount_paise, max_uses, per_user_limit, active)
values ('ODI10', 'percent', 10, 50000, 50000, null, 5, true);
