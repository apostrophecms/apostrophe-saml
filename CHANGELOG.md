## Changelog

### 2.3.2

For users who have logged in before, caching of the redirect to the IDP can result in a "stale request" error from Shibboleth and possibly other identity providers on future login attempts. Resolved this by issuing appropriate headers to prevent any caching of the 302 redirect.

### 2.3.1

The `passport-saml-metadata` dependency has been pinned to the `1.4.x` series to address a
problem seen when logging into Shibboleth identity providers with `passport-saml-metadata` 1.6.x.
We are reporting this issue upstream.

### 2.3.0

`passportSamlOptions` may be passed as an option to the module and will be passed on directly to `passport-saml`.

### 2.2.1

* Adds option to prevent overrides of Apostrophe database properties once set. See "Disabling field updates" docs section for more.

### 2.1.1

* Documentation on a better way to switch `/login` to point to this module. No code changes.

### 2.1.0

* This module incorrectly assumed that the `eduPersonPrincipalName` is the user's email address. That is not the case. Although it looks like an email address it is much closer to a domain-scoped username. We now map this field to the `username` (by default), and touch `email` only if it is provided as a separate field in the profile as determined by the `attributeMapping`.
* The `attributeMapping` method was added. This can be used to assign `username` from a different property, as well as mapping other attributes.
* Existing users are updated at login time with the latest values of their mapped attributes.

### 2.0.1

* Default callback URL in metadata did not match default callback path, which forced explicit configuration of callback URL. Explicit configuration still works, but now you can also accept the default successfully.
* More docs.

### 2.0.0

Initial release.
