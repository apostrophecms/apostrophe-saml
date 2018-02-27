var passportSaml = require('passport-saml');
var fs = require('fs');
var _ = require('lodash');

module.exports = {

  // Build up our options dynamically before
  // the parent class sees them

  afterConstruct: function(self, callback) {
    self.enablePassportStrategy();
    self.generateMetadata();
    self.addRoutes();
    return self.ensureGroup(callback);
  },

  construct: function(self, options) {

    self.enablePassportStrategy = function() {
      // Builds most of the config for us from Penn's metadata at startup
      var psm = require('passport-saml-metadata');

      // This is the IdP's metadata, not ours
      var confFolder = _.last(self.__meta.chain).dirname;
      var reader = new psm.MetadataReader(fs.readFileSync(confFolder + '/their-metadata.xml', 'utf8'));
      var config = psm.toPassportConfig(reader);
      config.decryptionCert = fs.readFileSync(confFolder + '/our.cer', 'utf8');
      config.decryptionPvk = fs.readFileSync(confFolder + '/our.key', 'utf8');
      // match how certs were made (see README)
      config.signatureAlgorithm = 'sha256';
      // must be unique to this site, as required by Penn. It's common practice to
      // use the URL of our metadata (which doesn't have to be published like this, but
      // it's standard practice and doesn't hurt anything)
      config.issuer = self.getIssuer();
      // Without this it looks for emailAddress, which is not available
      config.identifierFormat = null;
      // passport-saml uses entryPoint, not identityProviderUrl
      config.entryPoint = config.identityProviderUrl;  
      config.callbackUrl = options.callbackUrl || (options.apos.options.baseUrl + '/auth/saml/callback');

      var strategy = new passportSaml.Strategy(
        config,
        self.profileCallback
      );
      self.strategy = strategy;
      
      self.apos.login.passport.use(strategy);
    };

    self.generateMetadata = function() {x
      var confFolder = _.last(self.__meta.chain).dirname;
      var metadata = self.strategy.generateServiceProviderMetadata(fs.readFileSync(confFolder + '/our.cer', 'utf8'));
      fs.writeFileSync(self.apos.rootDir + '/public/' + require('path').basename(self.getIssuer()), metadata);
    };

    self.getIssuer = function() {
      return options.issuer || (options.apos.options.baseUrl + '/saml-metadata.xml');
    };

    self.getLoginPath = function() {
      if (options.loginUrl) {
        return require('url').parse(options.loginUrl).pathname;
      } else {
        return '/auth/saml/login';
      }
    };

    self.getCallbackPath = function() {
      if (options.callbackUrl) {
        return require('url').parse(options.callbackUrl).pathname;
      } else {
        return '/auth/saml/login/callback';
      }
    };

    self.addRoutes = function() {
      self.apos.app.get(self.getLoginPath(),
        self.apos.login.passport.authenticate('saml', { failureRedirect: self.getLoginPath() }),
        function(req, res) {
          res.redirect('/');
        }
      );

      self.apos.app.post(self.getCallbackPath(),
        function(req, res, next) {
          return self.apos.login.passport.authenticate(
            'saml',
            { failureRedirect: '/', failureFlash: true }
          )(req, res, next);
        },
        // actual route
        function(req, res) {
          return self.apos.login.afterLogin(req, res);
        }
      );

      self.apos.on('csrfExceptions', function(list) {
        list.push(self.getCallbackPath());
      });

      self.apos.app.get('/logout',
        function(req, res) {
          req.logout();
          res.redirect('/');
        }
      );
    };
      
    self.profileCallback = function(profile, callback) {

      profile = self.adjustProfile(profile);

      var req = self.apos.tasks.getReq();
      var criteria = {};
      
      if (options.accept) {
        if (!options.accept(profile)) {
          return callback(null, false);
        }
      }     
      
      if (typeof(options.match) === 'function') {
        criteria = options.match(profile);
      } else {
        if (!profile.email) {
          // User has no email
          return callback(null, false);
        }
        criteria.email = profile.email;
      }
      criteria.disabled = { $ne: true };
      return self.apos.users.find(req, criteria).toObject(function(err, user) {
        if (err) {
          return callback(err);
        }
        if (user) {
          return callback(null, user);
        }
        if (!self.options.create) {
          return callback(null, false);
        }
        return self.createUser(profile, function(err, user) {
          if (err) {
            // Typically a duplicate key, not surprising with username and
            // email address duplication possibilities when we're matching
            // on the other field, treat it as a login error
            return callback(null, false);
          }
          return callback(null, user);
        });
      });
    };

    // You might need to override this method at project level if
    // the profile provided by your SAML provider is different.
    // This method works well for Shibboleth at UPenn.

    self.adjustProfile = function(profile) {
      // pennkey id (eduPersonPrincipalName) is effectively both email and username
      var finalProfile = {
        email: profile['urn:oid:1.3.6.1.4.1.5923.1.1.1.6'],
        username: profile['urn:oid:1.3.6.1.4.1.5923.1.1.1.6'],
        surname: profile['urn:oid:2.5.4.4'],
        givenName: profile['urn:oid:2.5.4.42'],
        displayName: profile['urn:oid:2.16.840.1.113730.3.1.241'],
      };
      finalProfile.surname = finalProfile.surname || finalProfile.username.replace(/@.*$/, '');
      finalProfile.givenName = finalProfile.givenName || '';
      finalProfile.displayName = finalProfile.displayName || finalProfile.username;
      finalProfile.commonName = (finalProfile.givenName + ' ' + finalProfile.surname).trim();
      return finalProfile;
    };
    
    // Create a new user based on a profile. This occurs only
    // if the "create" option is set and a user arrives who has
    // a valid passport profile but does not exist in the local database.

    self.createUser = function(profile, callback) {
      var user = self.apos.users.newInstance();
      user.title = profile.commonName;
      if (!profile.email) {
        return callback('No email in profile, cannot set username');
      }
      user.email = profile.email;
      user.username = profile.email;
      user.firstName = profile.givenName;
      if (profile.middleName) {
        user.firstName += ' ' + profile.middleName;
      }
      user.lastName = profile.surName;
      var req = self.apos.tasks.getReq();
      if (self.createGroup) {
        user.groupIds = [ self.createGroup._id ];
      }
      if (options.import) {
        // Allow for specialized import of more fields
        options.import(profile, user);
      }
      return self.apos.users.insert(req, user, function(err) {
        return callback(err, user);
      });
    };

    // Ensure the existence of an apostrophe-group for newly
    // created users, as configured via the `group` subproperty
    // of the `create` option.
    
    self.ensureGroup = function(callback) {
      if (!(self.options.create && self.options.create.group)) {
        return setImmediate(callback);
      }
      return self.apos.users.ensureGroup(self.options.create.group, function(err, group) {
        self.createGroup = group;
        return callback(err);
      });
    };
  }
};
