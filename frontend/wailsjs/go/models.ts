export namespace cdp {
	
	export class Config {
	    geminiApiKey: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.geminiApiKey = source["geminiApiKey"];
	    }
	}
	export class CookieEntry {
	    name: string;
	    value: string;
	    domain: string;
	    path: string;
	    expires: number;
	    httpOnly: boolean;
	    secure: boolean;
	    sameSite: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new CookieEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.domain = source["domain"];
	        this.path = source["path"];
	        this.expires = source["expires"];
	        this.httpOnly = source["httpOnly"];
	        this.secure = source["secure"];
	        this.sameSite = source["sameSite"];
	        this.size = source["size"];
	    }
	}
	export class DOMNode {
	    nodeId: number;
	    nodeType: number;
	    nodeName: string;
	    localName: string;
	    attributes: string[];
	    childCount: number;
	    nodeValue: string;
	    children: DOMNode[];
	
	    static createFrom(source: any = {}) {
	        return new DOMNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodeId = source["nodeId"];
	        this.nodeType = source["nodeType"];
	        this.nodeName = source["nodeName"];
	        this.localName = source["localName"];
	        this.attributes = source["attributes"];
	        this.childCount = source["childCount"];
	        this.nodeValue = source["nodeValue"];
	        this.children = this.convertValues(source["children"], DOMNode);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SearchResult {
	    nodeId: number;
	    highlightNodeId: number;
	    nodeName: string;
	    localName: string;
	    nodeValue: string;
	    selector: string;
	
	    static createFrom(source: any = {}) {
	        return new SearchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodeId = source["nodeId"];
	        this.highlightNodeId = source["highlightNodeId"];
	        this.nodeName = source["nodeName"];
	        this.localName = source["localName"];
	        this.nodeValue = source["nodeValue"];
	        this.selector = source["selector"];
	    }
	}
	export class StorageEntry {
	    key: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new StorageEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class TabInfo {
	    id: string;
	    title: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new TabInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.url = source["url"];
	    }
	}
	export class WebVitals {
	    fcp: number;
	    lcp: number;
	    cls: number;
	    ttfb: number;
	    domContentLoaded: number;
	    load: number;
	
	    static createFrom(source: any = {}) {
	        return new WebVitals(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fcp = source["fcp"];
	        this.lcp = source["lcp"];
	        this.cls = source["cls"];
	        this.ttfb = source["ttfb"];
	        this.domContentLoaded = source["domContentLoaded"];
	        this.load = source["load"];
	    }
	}

}

