import BookingWorkspacePage from '../modules/booking/BookingWorkspacePage.svelte';
import MerchantWorkspacePage from '../modules/merchant/MerchantWorkspacePage.svelte';
import RecruitingWorkspacePage from '../modules/recruiting/RecruitingWorkspacePage.svelte';
import OrgAdminWorkspacePage from '../modules/org-admin/OrgAdminWorkspacePage.svelte';
import BootstrapAdminRoute from './routes/BootstrapAdminRoute.svelte';
import LoginRoute from './routes/LoginRoute.svelte';
import NotFoundRoute from './routes/NotFoundRoute.svelte';
import PermissionDeniedRoute from './routes/PermissionDeniedRoute.svelte';

export const routes = {
  '/': LoginRoute,
  '/bootstrap-admin': BootstrapAdminRoute,
  '/login': LoginRoute,
  '/merchant': MerchantWorkspacePage,
  '/booking': BookingWorkspacePage,
  '/recruiting': RecruitingWorkspacePage,
  '/org-admin': OrgAdminWorkspacePage,
  '/denied': PermissionDeniedRoute,
  '*': NotFoundRoute
};
