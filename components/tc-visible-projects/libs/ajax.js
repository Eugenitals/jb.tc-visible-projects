(function(factory) {
    if (typeof require === 'function' && typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else if (typeof define === 'function') {
        define(factory);
    } else {
        window.Ajax = factory();
    }
}(function () {
    function emptyFn () {}

    function onreadystatechange () {
        if (this.xhr.readyState == 4 /* complete */) {
            this.endTime = new Date().getTime();

            if (
                this.xhr.status > 199 &&
                this.xhr.status < 300
            ) {
                this.success.call(this.context, this.xhr.responseText, this.xhr.status, this);
            } else {
                this.error.call(this.context, this, this.xhr.status);
            }
            this.done.call(this.context, this, this.xhr.status);
        }
    }

    var Ajax = function (url, config) {
        if (window.XMLHttpRequest) {
            this.xhr = new window.XMLHttpRequest;
        } else {
            try {
                this.xhr = new ActiveXObject("MSXML2.XMLHTTP.3.0");
            } catch (ex) {
                throw new Error('AJAX (XMLHTTP) not supported');
            }
        }

        if (url instanceof Object) {
            config = url;
        }

        if (typeof url === "string") {
            this.url = url;
        } else if (config.hasOwnProperty('url')) {
            this.url = config.url;
        } else {
            throw new Error('Ajax has no "url" specified');
        }

        this.config = config || {};
        this.config.url = this.url;

        this.before = config.before || emptyFn;
        this.success = config.success || emptyFn;
        this.error = config.error || emptyFn;
        this.done = config.done || emptyFn;

        this.username = config.username || null;
        this.password = config.password || null;

        this.method = config.method || 'GET';
        this.async = config.async !== undefined
            ? config.async
            : true;
        this.headers = config.headers || {};
        this.context = config.context || window;
        this.data = config.data || {};

        // Work with params
        var params = [];
        var resultUrl = this.url;

        if (typeof this.data === 'string') {
            params = this.data;
        }
        else if (typeof this.data === 'object') {
            if (window.FormData && this.data instanceof FormData) {
                params = this.data;
            } else {
                for (var param in this.data) if (this.data.hasOwnProperty(param)) {
                    params.push(param + '=' + this.data[ param ]);
                }
                params = params.join('&');
            }
        }
        else if (typeof this.data === 'array') {
            params = this.data.join(',');
        }

        if (typeof params === 'string') {
            params = params.replace(/%20/g, '+');
        }

        if (this.method.toLowerCase() === 'get') {
            params = encodeURI(params);
            if (params.length > 0) {
                if (this.url.indexOf('?') !== -1) {
                    resultUrl += '&' + params;
                } else {
                    resultUrl += '?' + params;
                }
            }
            params = null;
        }

        this.before.call(this.context, this, this.config);

        this.startTime = new Date().getTime();

        this.xhr.open(this.method, resultUrl, this.async, this.username, this.password);

        // Apply cookie
        this.xhr.withCredentials = true;

        // Set timeout
        if (config.timeout) {
            this.xhr.timeout = config.timeout;
        }

        // Apply headers
        for (var headerName in this.headers) if (this.headers.hasOwnProperty(headerName)) {
            this.xhr.setRequestHeader(headerName, this.headers[ headerName ]);
        }

        this.xhr.onreadystatechange = onreadystatechange.bind(this);
        this.xhr.send(params);
    };

    Ajax.prototype.abort = function () {
        this.xhr.abort();
    };

    return Ajax;
}));