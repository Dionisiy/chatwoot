import md5 from 'md5';
import Cookies from 'js-cookie';

const REQUIRED_USER_KEYS = ['avatar_url', 'email', 'name'];
const ALLOWED_USER_ATTRIBUTES = [...REQUIRED_USER_KEYS, 'identifier_hash'];

export const getUserCookieName = () => {
  const SET_USER_COOKIE_PREFIX = 'cw_user_';
  const { websiteToken: websiteIdentifier } = window.$chatwoot;
  return `${SET_USER_COOKIE_PREFIX}${websiteIdentifier}`;
};

export const getUserString = ({ identifier = '', user }) => {
  const userStringWithSortedKeys = ALLOWED_USER_ATTRIBUTES.reduce(
    (acc, key) => `${acc}${key}${user[key] || ''}`,
    ''
  );
  // custom_attributes не входит в ALLOWED_USER_ATTRIBUTES и раньше вообще не
  // участвовал в хэше. Из-за этого повторный setUser() с тем же
  // identifier/email/name, но с изменившимися custom_attributes, давал
  // идентичный хэш cookie (см. entrypoints/sdk.js#setUser) и тихо
  // игнорировался целиком — Chatwoot не получал ни новые атрибуты, ни даже
  // повторные email/name. Добавляем custom_attributes в хэш, чтобы их
  // изменение само по себе считалось "новыми данными" и слало set-user.
  const customAttributesString = user.custom_attributes
    ? JSON.stringify(user.custom_attributes)
    : '';
  return `${userStringWithSortedKeys}customAttributes${customAttributesString}identifier${identifier}`;
};

export const computeHashForUserData = (...args) => md5(getUserString(...args));

export const hasUserKeys = user =>
  REQUIRED_USER_KEYS.reduce((acc, key) => acc || !!user[key], false);

export const setCookieWithDomain = (
  name,
  value,
  { expires = 365, baseDomain = undefined } = {}
) => {
  const cookieOptions = {
    expires,
    sameSite: 'Lax',
    domain: baseDomain,
  };

  // if type of value is object, stringify it
  // this is because js-cookies 3.0 removed builtin json support
  // ref: https://github.com/js-cookie/js-cookie/releases/tag/v3.0.0
  if (typeof value === 'object') {
    value = JSON.stringify(value);
  }

  Cookies.set(name, value, cookieOptions);
};
