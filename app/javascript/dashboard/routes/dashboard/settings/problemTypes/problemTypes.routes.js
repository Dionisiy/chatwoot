import ProblemTypes from './Index.vue';
import { frontendURL } from '../../../../helper/URLHelper';
import SettingsWrapper from '../SettingsWrapper.vue';

export default {
  routes: [
    {
      path: frontendURL('accounts/:accountId/settings/problem-types'),
      meta: {
        permissions: ['administrator'],
      },
      component: SettingsWrapper,
      children: [
        {
          path: '',
          name: 'problem_types_settings',
          component: ProblemTypes,
          meta: {
            permissions: ['administrator'],
          },
        },
      ],
    },
  ],
};
