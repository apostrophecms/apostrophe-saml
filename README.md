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
      // This is the default issuer name sent to the identity provider.
      //
      // Must be a unique identifier, usually a URL much like this one.
      // Usually by prior agreement with your identity provider.
      issuer: 'https://example.com/metadata.xml',
      // This is the default. NOTE: changing this without telling
      // your identity provider may result in mysterious failed logins.
      // Make sure they are on board with what this URL has been set to
      callbackUrl: 'https://example.com/auth/saml/login/callback'
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
openssl req -new -x509 -days 365 -nodes -sha256 -out lib/modules/apostrophe-saml/our.cer -keyout lib/modules/apostrophe-saml/our.key`
```
\
*You must use SHA256 as shown here.*

Note that the files are written to `lib/modules/apostrophe-saml/our.cer` and `lib/modules/apostrophe-saml/our.key`. Apostrophe will automatically look in these locations.

> **PUT THE EXPIRATION DATE OF YOUR CERTIFICATE IN YOUR CALENDAR! The default is TWO YEARS.** > After that point you MUST generate a new certificate, provide the new metadata to your
> identity provider and redeploy, or logins will STOP WORKING. Consider using `openssl`
> options to create a longer-lived certificate. Your identity provider may place limits
> on this.
>
> **YOU MUST NEVER, EVER, EVER ADD `our.key` TO A PUBLIC GIT REPOSITORY.** It is reasonable to add it to a private repository.

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

## What if logins don't work?

* Make sure you generated the key and certificate and installed them to the right place.
* Make sure you installed the identity provider's metadata.
* Make sure you sent them your metadata and they received it and installed it.
* Make sure you didn't change your callback URL or any other setting from what you initially told your identity provider to expect.

If you have checked all of the above and it still doesn't work, it is possible that your identity provider doesn't offer the same profile information as the partners we have worked with, or requires things they do not. It may be time to contribute a pull request to this module to make it more flexible.

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

## Wait, how do permissions in Apostrophe work again?

A common question at this point. See [managing permissions in Apostrophe](http://apostrophecms.org/docs/tutorials/intermediate/permissions.html).

## Beefing up the "create" option: copying extra properties

The "create" option shown above will create a user with minimal information: first name, last name, full name, username, and email address (where available).

If you wish to import other fields from the profile object provided by the passport strategy, add an `import` function to your options to the module. The `import` function receives `(profile, user)` and may copy properties from `profile` to `user` as it sees fit. 

## What if an email address (eduPersonPrincipalName) changes?

Since this is usually the only identifier available, this could result in a duplicate account with the `create` option. The best advice we can give is to be aware and migrate control of content if needed. Or, you can provide a `match` option.

### A `match` function of your choice

If you provide a function, it will receive the user's profile from the passport strategy, and must return a MongoDB criteria object matching the appropriate user. Do not worry about checking the `disabled` or `type` properties, Apostrophe will handle that.

## Rejecting users for your own reasons

You can set your own policy for rejecting users by passing an `accept` function as an option. This function takes the `profile` object provided by the passport strategy and must return `true` otherwise the user is not permitted to log in.

## Frequently Asked Questions

"What about redirecting `/login` to Shibboleth?"

You can do that. Once the login page is gone, it's possible for you to decide what happens at that URL. Use the [apostrophe-redirects](https://npmjs.org/package/apostrophe-redirects) module to set it up through a nice UI, or add an Express route and a redirect in your own code.

## Changelog

2.0.0: initial release.
