## Purpose

`apostrophe-saml` provides single sign-on with identity providers based on SAML or Shibboleth. Shibboleth is very common in academic environments and is built on top of SAML, which is common in corporate environments.

> This module is separate from [apostrophe-passport](https://npmjs.org/package/apostrophe-passport) because that module makes assumptions that are not a good fit for SAML and Shibboleth. That module works better with OpenAuth identity providers like Google, Facebook, etc.

## Installation

```
npm install apostrophe-saml
```

## Configuration

```javascript
  // in app.js

  // The base URL of YOUR SITE.
  //
  // YOU MUST CONFIGURE baseUrl for this site. And in most cases your
  // identity provider won't play unless it is the URL you told them to
  // expect, which nearly always must use `https`

  baseUrl: 'https://example.com',

  modules: {
    'apostrophe-saml': {
      // OPTIONAL: create users if they do not already exist.
      // Assign them as members of a group called `from-shibboleth` and
      // grant them Apostrophe's `admin` permission (TOTAL CONTROL, use sparingly).
      create: {
        group: {
          title: 'from-shibboleth',
          permissions: [ 'admin' ]
        }
      },
      // OPTIONAL
      // attributeMapping: {
      //   [see below]
      // },
      // This is the default issuer name sent to the identity provider.
      //
      // Must be a unique identifier, usually a URL much like this one.
      // Usually by prior agreement with your identity provider.
      issuer: 'https://example.com/saml-metadata.xml',
      // This is the default. NOTE: changing this without telling
      // your identity provider may result in mysterious failed logins.
      // Make sure they are on board with what this URL has been set to
      callbackUrl: 'https://example.com/auth/saml/login/callback'
      //
      // OPTIONAL: Extra passport-saml options
      // Configuring saml in your environment can be tricky, and most
      // environments have unique aspects to them that aren't handled
      // directly by this wrapper. To help with this problem, you can
      // pass extra passport-saml options through the following object.
      // More details about available options can be found here:
      // https://github.com/bergie/passport-saml#config-parameter-details
      //
      //  passportSamlOptions: {
      //    disableRequestedAuthnContext: true,
      //    logoutUrl: 'https://examples.com/auth/saml/SLO',
      //    forceAuthn: true 
      //  }
    },
    'apostrophe-login': {
      // OPTIONAL: disable regular site logins completely
      localLogin: false
    }
  }
```

## Installing your key and certificate

We need a self-signed key and certificate. These are used for SAML assertions, they are *not* involved in HTTPS. Usually a self-signed certificate will do. Here is the openssl command:

```
mkdir -p lib/modules/apostrophe-saml
openssl req -new -x509 -days 365 -nodes -sha256 -out lib/modules/apostrophe-saml/our.cer -keyout lib/modules/apostrophe-saml/our.key -days 3650
```

*You must use SHA256 as shown here.*

Versions of openssl may differ a bit. If yours doesn't like the `-days` option, or your identity provider doesn't like a 10-year certificate, you can just use the default lifetime (usually 2 years).

Note that the files are written to `lib/modules/apostrophe-saml/our.cer` and `lib/modules/apostrophe-saml/our.key`. Apostrophe will automatically look in these locations.

**PUT THE EXPIRATION DATE OF YOUR CERTIFICATE IN YOUR CALENDAR! The default is TWO YEARS.**
After that point you MUST generate a new certificate, provide the new metadata to your
identity provider and redeploy, or logins will STOP WORKING.

**YOU MUST NEVER, EVER, EVER ADD `our.key` TO A PUBLIC GIT REPOSITORY.** It is reasonable to add it to a private repository.

## Installing the identity provider's metadata

You must obtain the identity provider's `metadata.xml` file and copy it into place:

```
cp ~/Downloads/metadata.xml lib/modules/apostrophe-saml/their-metadata.xml
```

**You can obtain this file from your contact at the identity provider.**

## Delivering *your* `issuer` ID and `metadata.xml` to the identity provider

The identity provider will require that you give them an issuer ID and a metadata file.

If your `baseUrl` is `https://example.com`, then your issuer ID defaults to `https://example.com/saml-metadata.xml`. And, that URL also serves your metadata. That file is updated each time the site restarts (although it is unlikely to ever change once your configuration is fixed in place).

## Where do I `require` the passport-saml strategy?

You don't. Apostrophe does it for you.

## How do users log in?

Create a link to the relative path `/auth/saml/login` for them.

That's all there is to it. When a user reaches this URL they are redirected to begin the authorization process with the identity provider.

## Attribute mapping

By default, this module looks for SAML2 profile attributes that are common in Shibboleth configurations found in academia. If your identity provider offers different attributes, you may need to create a custom attribute mapping.

The default value of the `attributeMapping` option is below. You can change this to map any set of profile properties to any set of Apostrophe user properties. Keep in mind that `title` should be the user's full name and `username` should be populated with the best unique identifier available in the profile.

```javascript
{
  // eduPersonPrincipalName. In education this is the best
  // unique identifier typically available
  'urn:oid:1.3.6.1.4.1.5923.1.1.1.6': 'username',
  // Often not available
  'urn:oid:0.9.2342.19200300.100.1.3': 'email',
  'urn:oid:2.5.4.4': 'lastName',
  'urn:oid:2.5.4.42': 'firstName',
  // commonName. Not always available
  'urn:oid:2.5.4.3': 'title',
  // Last, First
  'urn:oid:2.16.840.1.113730.3.1.241': 'displayName'
}
```

## Creating users on the fly

By default, users are not created if they don't already exist on the site. If the user on the federated site (gitlab, in this example) is valid but the same username doesn't exist on the Apostrophe site, no login takes place. It's possible to change this.

```javascript
'apostrophe-saml': {
  // Presence of "create" key means we'll create users on the fly
  create: {
    // Presence of "group" means we'll add them to a group...
    group: {
      // Called "shibboleth"...
      title: 'shibboleth',
      // With these Apostrophe permissions (admin can do ANYTHING, so be careful)
      permissions: [ 'admin' ]
    }
  }
}
```

"Do I have to pre-create the group users will be added to?" No, it will be created for you. Also, if you supply a `permissions` property, it will always be refreshed to those permissions at restart. You might consider leaving that property off and manually setting the permissions via the groups editor.

## Disabling field updates

To prevent specific fields in the CMS database from being overwritten by the external data, add those fields to an `avoidOverride` array in the options. These fields will be populated if they were previously empty, but if a value already exists they'll not be updated.

For example, to disable updates of name fields, that might look like:

```javascript
'apostrophe-saml': {
  avoidOverride: ['firstName', 'lastName']
}
```

## Wait, how do permissions in Apostrophe work again?

A common question at this point. See [managing permissions in Apostrophe](http://apostrophecms.org/docs/tutorials/intermediate/permissions.html).

## What if a unique identifier (such as `eduPersonPrincipalName`) changes?

This can happen when users change their identity in the system due to a change of last name or similar. Since this is usually the only identifier available, this could result in a duplicate account with the `create` option. The best advice we can give is to be aware and migrate control of content if needed.

### A `match` function of your choice

If you provide a function as the `match` option, it will receive the user's profile from the passport strategy, and must return a MongoDB criteria object matching the appropriate user. This is a substitute for the automatic comparison to `username`. Do not worry about checking the `disabled` or `type` properties, Apostrophe will handle that.

## Rejecting users for your own reasons

You can set your own policy for rejecting users by passing an `accept` function as an option. This function takes the `profile` object, after it has been mapped via `attributeMapping` and the `adjustProfile` method, and must return `true` if the user should be allowed to log in.

## What about logging in at `/login` for familiarity?

Sure. Just set the `loginUrl` option to `/login`.

However, in addition, you must disable ordinary local logins:

```javascript
    'apostrophe-saml': {
      // other options, then...
      loginUrl: '/login'
    },
    'apostrophe-login': {
      // OPTIONAL: disable regular site logins completely
      localLogin: false
    }
```

> Tip: you will probably want to do this only in `data/local.js` on your production and possibly staging servers, so local login remains possible in your dev environment, where you probably don't have a hostname that is registered with the identity provider for SAML login.

## What if logins don't work?

* Make sure the user actually exists in Apostrophe, with a `username` matching the unique identifier you've mapped to `username` (see above). Or, see "creating users on the fly," below.
* Make sure you generated the key and certificate and installed them to the right place.
* Make sure you installed the identity provider's metadata.
* Make sure you sent them your metadata and they received it and installed it.
* Make sure you didn't change your callback URL or any other setting from what you initially told your identity provider to expect.
* Make sure the profile data provided by your identity provider includes the property you are mapping to `username`, above.

If you have checked all of the above and it still doesn't work, you might need to do some custom massage on the profile object. You can extend or override the `adjustProfile` method of this module as you normally would when extending Apostrophe; see the source for more information.

## Changelog

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
