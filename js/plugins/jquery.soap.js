/*==========================
jquery.soap.js  http://plugins.jquery.com/soap/ or https://github.com/doedje/jquery.soap
version: 1.3.4

jQuery plugin for communicating with a web service using SOAP.

One function to send a SOAPEnvelope that takes a complex object as a data

License GNU/GPLv3
-----------------

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

I may consider permitting uses outside of the license terms on a by-case basis.

Information
-----------

For information about how to use jQuery.soap, authors, changelog, the latest version, etc...
Visit: https://github.com/doedje/jquery.soap

Documentation about THIS version is found here:
https://github.com/doedje/jquery.soap/blob/1.3.4/README.md

======================*/

(function($) {
  var enableLogging;
  var globalConfig = { // this setup once, defaults go here
    appendMethodToURL: true,
    async: true,
    enableLogging: false,
    noPrefix: false,
    soap12: false
  };

  $.soap = function(options) {
    var config = {};

    // a configuration call will not have 'data' specified ('params' is used for backwards compatibility)
    if (options && !options.params && !options.data) {
      $.extend(globalConfig, options); // update global config
      enableLogging = true;
      log('jQuery.soap: globalConfig updated:', globalConfig);
      return;
    }
    $.extend(config, globalConfig, options);
    // function log will only work below this line!
    enableLogging = config.enableLogging;

    log('jquery.soap - config:', config);

    // fallbacks for changed properties
    SOAPTool.fallbackDeprecated(config);

    var soapObject = SOAPTool.processData({
      data: config.data,
      name: (!!config.elementName) ? config.elementName : config.method,
      prefix: (!!config.namespaceQualifier && !config.noPrefix) ? config.namespaceQualifier + ':' : '',
      namespaceURL: config.namespaceURL,
      namespaceQualifier: config.namespaceQualifier
    });

    if (!!soapObject && !!config.url) { // we have a request and somewhere to send it
      // Create a SOAPEnvelope with the soapObject
      var soapEnvelope = new SOAPEnvelope(soapObject);
      // Additional attributes and namespaces for the Envelope
      if (config.envAttributes) {
        for (var i in config.envAttributes) {
          soapEnvelope.addAttribute(i, config.envAttributes[i]);
        }
      }
      // WSS
      if (!!config.wss) {
        var wssObj = SOAPTool.createWSS(config.wss);
        // add to WSS Security header to soapEnvelope
        if (!!wssObj) {
          soapEnvelope.addHeader(wssObj);
        }
      }
      // append Method?
      if (!!config.appendMethodToURL && !!config.method) {
        config.url += config.method;
      }
      return soapEnvelope.send({
        url: config.url,
        async: config.async,
        headers: (config.HTTPHeaders) ? config.HTTPHeaders : {},
        action: (!!config.SOAPAction) ? config.SOAPAction : config.method,
        soap12: config.soap12,
        beforeSend: config.beforeSend
      }).done(function(data, textStatus, jqXHR) {
        var response = new SOAPResponse(textStatus, jqXHR);
        log('jquery.soap - receive:', $.parseXML(response.toString()).firstChild);
        if ($.isFunction(config.success)) {
          config.success(response);
        }
      }).fail(function(jqXHR, textStatus, errorThrown) {
        log('jquery.soap - error:', errorThrown);
        if ($.isFunction(config.error)) {
          config.error(new SOAPResponse(textStatus, jqXHR));
        }
      });
    }
  };

  //Soap request - this is what being sent
  function SOAPEnvelope(soapObject) {
    this.typeOf = "SOAPEnvelope";
    this.prefix = 'soapenv';
    this.soapConfig = null;
    this.attributes = [];
    this.headers = [];
    this.bodies = [];

    // let's get the soap namespace prefix
    var parts = soapObject.name.split(':');
    if (parts[1] === 'Envelope' || parts[1] === 'Body') {
      this.prefix = parts[0];
      if (soapObject.attr('xmlns:' + this.prefix) === SOAPTool.SOAP11.namespaceURL) {
        this.soapConfig = this.SOAP11;
      }
      if (soapObject.attr('xmlns:' + this.prefix) === SOAPTool.SOAP12.namespaceURL) {
        this.soapConfig = this.SOAP12;
      }
      // Envelope
      var env = soapObject.find(this.prefix + ':Envelope');
      if (env && env.attributes) {
        for (var i in env.attributes) {
          this.addAttribute(i, env.attributes[i]);
        }
      }
      // headers
      header = soapObject.find(this.prefix + ':Header');
      if (header && header.children) {
        for (var j in header.children) {
          this.addHeader(header.children[j]);
        }
      }
      // body
      body = soapObject.find(this.prefix + ':Body');
      if (body && body.children) {
        for (var k in body.children) {
          this.addBody(body.children[k]);
        }
      } else {
        for (var l in soapObject.children) {
          this.addBody(soapObject.children[l]);
        }
      }
    } else {
      // a soapObject with nothing, mere data
      this.addBody(soapObject);
    }
  }

  SOAPEnvelope.prototype = {
    addAttribute: function(name, value) {
      this.attributes[name] = value;
    },
    addNamespace: function(name, uri) {
      this.addAttribute('xmlns:' + name, uri);
    },
    addHeader: function(soapObject) {
      this.headers.push(soapObject);
    },
    addBody: function(soapObject) {
      this.bodies.push(soapObject);
    },
    toString: function() {
      var soapEnv = new SOAPObject(this.prefix + ':Envelope');
      //Add attributes
      for (var name in this.attributes) {
        soapEnv.attr(name, this.attributes[name]);
      }
      //Add Headers
      if (this.headers.length >= 0) {
        var soapHeader = soapEnv.newChild(this.prefix + ':Header');
        for (var i in this.headers) {
          soapHeader.appendChild(this.headers[i]);
        }
      }
      //Add Bodies
      if (this.bodies.length > 0) {
        var soapBody = soapEnv.newChild(this.prefix + ':Body');
        for (var j in this.bodies) {
          soapBody.appendChild(this.bodies[j]);
        }
      }
      // Check for main NS over here...
      if (!soapEnv.attr('xmlns:' + this.prefix)) {
        soapEnv.addNamespace(this.prefix, this.soapConfig.namespaceURL);
      }
      return soapEnv.toString();
    },
    send: function(options) {
      if (!this.soapConfig) {
        this.soapConfig = (options.soap12) ? SOAPTool.SOAP12 : SOAPTool.SOAP11;
      }
      var contentType = this.soapConfig.type;
      if (contentType === SOAPTool.SOAP11.type && !!options.action) {
        options.headers.SOAPAction = options.action;
      }
      log('jquery.soap - beforeSend:', $.parseXML(this.toString()).firstChild);
      // function to preview the SOAPEnvelope before it is send to the server
      if ($.isFunction(options.beforeSend)) {
        options.beforeSend(this);
      }
      return $.ajax({
        type: "POST",
        url: options.url,
        async: options.async,
        headers: options.headers,
        //	crossDomain: true,
        dataType: "xml",
        processData: false,
        data: this.toString(),
        contentType: contentType + "; charset=UTF-8"
      });
    }
  };

  // SOAPObject - an abstraction layer to build SOAP Objects.
  var SOAPObject = function(name) {
    this.typeOf = 'SOAPObject';
    this.name = name;
    this.ns = {};
    this.attributes = {};
    this._parent = null;
    this.children = [];
    this.value = null;

    this.attr = function(name, value) {
      if (!!name && !!value) {
        this.attributes[name] = value;
        return this;
      } else if (!!name) {
        return this.attributes[name];
      } else {
        return this.attributes;
      }
    };
    this.val = function(value) {
      if (!value) {
        return this.value;
      } else {
        this.value = value;
        return this;
      }
    };
    this.addNamespace = function(name, url) {
      this.ns[name] = url;
      return this;
    };
    this.appendChild = function(obj) {
      obj._parent = this;
      this.children.push(obj);
      return obj;
    };
    this.newChild = function(name) {
      var obj = new SOAPObject(name);
      this.appendChild(obj);
      return obj;
    };
    this.addParameter = function(name, value) {
      var obj = new SOAPObject(name);
      obj.val(value);
      this.appendChild(obj);
      return this;
    };
    this.hasChildren = function() {
      return (this.children.length > 0) ? true : false;
    };
    this.find = function(name) {
      if (this.name === name) {
        return this;
      } else {
        for (var i in this.children) {
          var result = this.children[i].find(name);
          if (result) {
            return result;
          }
        }
      }
    };
    this.end = this.parent = function() {
      return this._parent;
    };
    this.toString = function() {
      var out = [];
      out.push('<' + this.name);
      //Namespaces
      for (var name in this.ns) {
        out.push(' xmlns:' + name + '="' + this.ns[name] + '"');
      }
      //Node Attributes
      for (var attr in this.attributes) {
        out.push(' ' + attr + '="' + this.attributes[attr] + '"');
      }
      out.push('>');
      //Node children
      if (this.hasChildren()) {
        for (var cPos in this.children) {
          var cObj = this.children[cPos];
          if ((typeof(cObj) === 'object') && (cObj.typeOf === 'SOAPObject')) {
            out.push(cObj.toString());
          }
        }
      }
      //Node Value
      if (!!this.value) {
        out.push(this.value);
      }
      //Close Tag
      out.push('</' + this.name + '>');
      return out.join('');
    };
  };

  //Soap response - this will be passed to the callback from SOAPClient.SendRequest
  var SOAPResponse = function(status, xhr) {
    this.typeOf = "SOAPResponse";
    this.status = status;
    this.headers = xhr.getAllResponseHeaders().split('\n');
    this.httpCode = xhr.status;
    this.httpText = xhr.statusText;
    this.content = (xhr.responseXML === undefined) ? xhr.responseText : xhr.responseXML;
    this.toString = function() {
      if (typeof this.content === 'string') {
        return this.content;
      }
      if ($.isXMLDoc(this.content)) {
        return SOAPTool.dom2string(this.content);
      }
      throw new Error("Unexpected Content: " + $.type(this.content));
    };
    this.toXML = function() {
      if ($.isXMLDoc(this.content)) {
        return this.content;
      }
      return $.parseXML(this.content);
    };
    this.toJSON = function() {
      if ($.xml2json) {
        return $.xml2json(this.content);
      }
      warn("jQuery.soap: Missing JQuery Plugin 'xml2json'");
    };
  };

  //Singleton SOAP Tool
  var SOAPTool = {
    SOAP11: {
      type: 'text/xml',
      namespaceURL: 'http://schemas.xmlsoap.org/soap/envelope/'
    },
    SOAP12: {
      type: 'application/soap+xml',
      namespaceURL: 'http://www.w3.org/2003/05/soap-envelope/'
    },
    processData: function(options) {
      var soapObject;
      if ($.type(options.data) === "string") {
        // if data is XML string, parse to XML DOM
        // ensure that string is not empty and contains more than whitespace
        if (/\S/.test(options.data)) {
          options.data = $.parseXML(options.data);
        }
      }
      if ($.isXMLDoc(options.data)) {
        // if data is XML DOM, parse to SOAPObject
        soapObject = SOAPTool.dom2soap(options.data.firstChild);
      } else if ($.isPlainObject(options.data)) {
        // if data is JSON, parse to SOAPObject
        if (!!options.name) {
          soapObject = SOAPTool.json2soap(options.name, options.data, options.prefix);
          if (!!options.namespaceQualifier && !!options.namespaceURL) {
            soapObject.addNamespace(options.namespaceQualifier, options.namespaceURL);
          }
        }
      } else if ($.isFunction(options.data)) {
        // if data is function, the function should return a SOAPObject
        soapObject = options.data(SOAPObject);
      }
      return soapObject;
    },
    json2soap: function(name, params, prefix, parentNode) {
      var soapObject;
      var childObject;
      if (params === null) {
        soapObject = new SOAPObject(prefix + name);
        soapObject.attr('nil', true);
      } else if (typeof params == 'object') {
        // soapObject = new SOAPObject(prefix+name);
        // added by DT - check if object is in fact an Array and treat accordingly
        if (params.constructor.toString().indexOf("Array") > -1) { // type is array
          // soapObject = parentNode;
          for (var x in params) {
            childObject = this.json2soap(name, params[x], prefix, parentNode);
            parentNode.appendChild(childObject);
          }
        } else {
          soapObject = new SOAPObject(prefix + name);
          for (var y in params) {
            childObject = this.json2soap(y, params[y], prefix, soapObject);
            if (childObject) {
              soapObject.appendChild(childObject);
            }
          }
        }
      } else {
        soapObject = new SOAPObject(prefix + name);
        soapObject.val('' + params); // the ''+ is added to fix issues with falsey values.
      }
      return soapObject;
    },
    dom2soap: function(xmldom) {
      var whitespace = /^\s+$/;
      var soapObject = new SOAPObject(xmldom.nodeName);
      for (var i in xmldom.attributes) {
        var attribute = xmldom.attributes[i];
        soapObject.attr(attribute.name, attribute.value);
      }
      for (var j in xmldom.childNodes) {
        var child = xmldom.childNodes[j];
        if (child.nodeType === 1) {
          var childObject = SOAPTool.dom2soap(child);
          soapObject.appendChild(childObject);
        }
        if (child.nodeType === 3 && !whitespace.test(child.nodeValue)) {
          soapObject.val(child.nodeValue);
        }
      }
      return soapObject;
    },
    dom2string: function(dom) {
      if (typeof XMLSerializer !== "undefined") {
        return new window.XMLSerializer().serializeToString(dom);
      } else {
        return dom.xml;
      }
    },
    createWSS: function(wssValues) {
      if (!!wssValues.username && !!wssValues.password) {
        var wssConst = {
          security: "wsse:Security",
          securityNS: "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd",
          usernameToken: "wsse:UsernameToken",
          usernameTokenNS: "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd",
          username: "wsse:Username",
          usernameType: "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd",
          password: "wsse:Password",
          passwordType: "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText",
          nonce: "wsse:Nonce",
          nonceType: "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd",
          wsuCreated: "wsu:Created",
          wsuCreatedType: "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
        };
        var WSSObj = new SOAPObject(wssConst.security)
          .addNamespace('wsse', wssConst.securityNS)
          .addNamespace('wsu', wssConst.usernameTokenNS)
          .newChild(wssConst.usernameToken)
          .newChild(wssConst.username)
          .attr('Type', wssConst.usernameType)
          .val(wssValues.username)
          .end()
          .newChild(wssConst.password)
          .attr('Type', wssConst.passwordType)
          .val(wssValues.password)
          .end()
          .end();
        var userTokenObj = WSSObj.find(wssConst.usernameToken);
        if (!!wssValues.nonce) {
          userTokenObj
            .newChild(wssConst.nonce)
            .attr('Type', wssConst.nonceType)
            .val(wssValues.nonce);
        }
        if (!!wssValues.created) {
          userTokenObj
            .newChild(wssConst.wsuCreated)
            .attr('Type', wssConst.wsuCreatedType)
            .val(wssValues.created);
        }
        return WSSObj;
      }
    },
    fallbackDeprecated: function(config) {
      // fallbacks for changed properties: (the old names will deprecate at version 2.0.0!)
      var deprecated = {
        // usage -> oldParam: 'newParam'
        namespaceUrl: 'namespaceURL',
        request: 'beforeSend',
        params: 'data'
      };
      for (var oldParam in deprecated) {
        var newParam = deprecated[oldParam];
        if (!config[newParam] && !!config[oldParam]) {
          warn('jquery.soap: ' + oldParam + ' is deprecated, use ' + newParam + ' instead!');
          config[newParam] = config[oldParam];
          delete config[oldParam];
        }
      }
    }
  };

  function log() {
    if (enableLogging && typeof(console) === 'object') {
      if ($.isFunction(console.log)) {
        if (arguments.length == 1) {
          console.log(arguments[0]);
        } else {
          console.log(arguments);
        }
      }
    }
  }

  function warn() {
    if (typeof(console) === 'object') {
      if ($.isFunction(console.warn)) {
        if (arguments.length == 1) {
          console.warn(arguments[0]);
        } else {
          console.warn(arguments);
        }
      }
    }
  }
})(jQuery);