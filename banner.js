// Puts the shop's banner photo (set in Admin > Settings) behind the strip at the top of a page
(async function () {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  try {
    const { data } = await db
      .from('settings')
      .select('hero_image_url')
      .eq('id', 1)
      .maybeSingle();

    if (!data || !data.hero_image_url) return;

    // A blue layer over the photo keeps the white text easy to read
    hero.style.backgroundImage =
      'linear-gradient(rgba(30, 58, 138, 0.72), rgba(29, 78, 216, 0.6)), url("' + data.hero_image_url + '")';
    hero.classList.add('has-photo');

    // A slimmer banner than the home page, so the page content stays near the top
    hero.style.minHeight = '150px';
    hero.style.padding = '30px 16px';
  } catch (e) {
    // If the photo cannot load, the plain blue banner stays
  }
})();