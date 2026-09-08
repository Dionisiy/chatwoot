// Язык, на котором виджет прямо сейчас показан клиенту: настройки инбокса,
// ?locale= в адресе или ручной выбор в переключателе (LocaleSwitcher.vue) —
// что из этого победило, знает только сам vue-i18n, поэтому спрашиваем его.
export const getWidgetDisplayLocale = () =>
  window.WOOT_WIDGET?.$root?.$i18n?.locale || 'en';

export const buildSearchParamsWithLocale = search => {
  const params = new URLSearchParams(search);
  params.append('locale', getWidgetDisplayLocale());

  return `?${params}`;
};

export const getLocale = (search = '') => {
  return new URLSearchParams(search).get('locale');
};

export const buildPopoutURL = ({
  origin,
  conversationCookie,
  websiteToken,
  locale,
}) => {
  const popoutUrl = new URL('/widget', origin);
  popoutUrl.searchParams.append('cw_conversation', conversationCookie);
  popoutUrl.searchParams.append('website_token', websiteToken);
  popoutUrl.searchParams.append('locale', locale);

  return popoutUrl.toString();
};
