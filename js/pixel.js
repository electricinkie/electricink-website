// Meta Pixel loader.
// fbevents.js is NOT requested on page load: js/consent.js calls window.eiLoadMetaPixel
// after the visitor clicks "Accept all" (or on load, when an accepted choice is stored).
// Until then window.fbq does not exist, so the fbq('track', ...) calls across the site
// (they all check typeof fbq === 'function') do nothing.
(function() {
  if (document.cookie.includes('exclude_pixel=true')) return;

  var loaded = false;

  function load() {
    if (loaded) return;
    loaded = true;
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window,document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '830905513373282');
    fbq('track', 'PageView');
  }

  window.eiLoadMetaPixel = load;

  // consent.js normally runs first; if an accepted choice is already stored, load right away
  if (window.eiConsent && window.eiConsent.granted()) load();
})();
