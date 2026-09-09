import EmailDeliveries from './Index.vue';
import { frontendURL } from '../../../../helper/URLHelper';
import SettingsWrapper from '../SettingsWrapper.vue';

export default {
  routes: [
    {
      path: frontendURL('accounts/:accountId/settings/email-deliveries'),
      meta: {
        permissions: ['administrator'],
      },
      component: SettingsWrapper,
      children: [
        {
          path: '',
          name: 'email_deliveries',
          component: EmailDeliveries,
          meta: {
            permissions: ['administrator'],
          },
        },
      ],
    },
  ],
};
