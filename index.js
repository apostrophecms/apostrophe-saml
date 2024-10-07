var passportSaml = require('@node-saml/passport-saml');
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

  beforeConstruct: function(self, options) {
    options.attributeMapping = options.attributeMapping || {
      'urn:oid:1.3.6.1.4.1.5923.1.1.1.6': 'username', // eduPersonPrincipalName
      'urn:oid:0.9.2342.19200300.100.1.3': 'email',
      'urn:oid:2.5.4.4': 'lastName',
      'urn:oid:2.5.4.42': 'firstName',
      // commonName. Not always available
      'urn:oid:2.5.4.3': 'title',
      // Last, First
      'urn:oid:2.16.840.1.113730.3.1.241': 'displayName'
    }
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
      config.callbackUrl = options.callbackUrl || (options.apos.options.baseUrl + '/auth/saml/login/callback');
      //Add our extra passportSamlOptions into our config object
      config = self.addPassportSamlOptions(config);
	  
      var strategy = new passportSaml.Strategy(
        config,
        self.profileCallback
      );
      self.strategy = strategy;
      
      self.apos.login.passport.use(strategy);
    };

    self.generateMetadata = function() {
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
	
    self.addPassportSamlOptions = function(config) {
      // Merge the base configuration options into the passportSamlOptions object.
      // Overrides in passportSamlOptions always win, as otherwise there is no
      // point in having the feature.
      return Object.assign({}, config, options.passportSamlOptions);
    };

    self.addRoutes = function() {
      self.apos.app.get(self.getLoginPath(),
        function(req, res, next) {
          // Caching of the redirect to the IDP can result in
          // a stale cache error from the IDP, do everything
          // possible to prevent this
          res.setHeader('cache-control', 'private, no-store, no-cache, max-age=0');
          res.setHeader('expires', 'Wed, 01 Jan 1997 12:00:00 GMT');
          return next();
        },
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
        if (!profile.username) {
          // User has no username
          return callback(null, false);
        }
        criteria.username = profile.username;
      }
      return self.apos.users.find(req, criteria).toObject(function(err, user) {
        if (err) {
          return callback(err);
        }
        if (user) {
          if (user.disabled) {
            return callback('login disabled', false);
          }
          return self.updateUser(user, profile, function(err) {
            if (err) {
              // Typically a duplicate key, not surprising with
              // email address duplication possibilities, treat it as a
              // login error
              return callback(null, false);
            }
            return callback(null, user);
          });
        }
        if (!self.options.create) {
          return callback(null, false);
        }
        return self.createUser(profile, function(err, user) {
          if (err) {
            // Typically a duplicate key, not surprising with
            // email address duplication possibilities, treat it as a
            // login error
            return callback(null, false);
          }
          return callback(null, user);
        });
      });
    };

    // You might need to override this method at project level if
    // the profile provided by your SAML provider has very
    // different attributes.
    //
    // This method works well for Shibboleth at UPenn.
    //
    // All attributes present are set and, later, updated
    // on users as they log in.

    self.adjustProfile = function(profile) {
      var finalProfile = {};
      _.each(self.options.attributeMapping, function(val, key) {
        finalProfile[val] = profile[key];
      });
      finalProfile.firstName = finalProfile.firstName || '';
      finalProfile.lastName = finalProfile.lastName || finalProfile.username.replace(/@.*$/, '');
      finalProfile.displayName = finalProfile.displayName || finalProfile.username;
      finalProfile.title = finalProfile.title || (finalProfile.firstName + ' ' + finalProfile.lastName).trim();
      return finalProfile;
    };
    
    // Create a new user based on a profile. This occurs only
    // if the "create" option is set and a user arrives who has
    // a valid passport profile but does not exist in the local database.

    self.createUser = function(profile, callback) {
      var user = self.apos.users.newInstance();
      if (!profile.username) {
        return callback('No username in profile, cannot set username');
      }
      self.mergeProfile(profile, user);
      var req = self.apos.tasks.getReq();
      if (self.createGroup) {
        user.groupIds = [ self.createGroup._id ];
      }
      return self.apos.users.insert(req, user, function(err) {
        return callback(err, user);
      });
    };

    self.updateUser = function(user, profile, callback) {
      self.mergeProfile(profile, user);
      var req = self.apos.tasks.getReq();
      return self.apos.users.update(req, user, function(err) {
        return callback(err, user);
      });
    };

    self.mergeProfile = function(profile, user) {
      _.each(profile, function(val, key) {
        // Check if a property should not be updated from an existing value.
        var excludeKey = _.includes(options.avoidOverride, key) && (user[key] !== undefined);

        // Do not clobber email entered in Apostrophe just because
        // none was defined in the profile
        if ((val !== undefined) && !excludeKey) {
          user[key] = val;
        }
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
