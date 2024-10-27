import { XMLParser } from 'fast-xml-parser';

function compareString( n, h ){
    if(n.includes('*')){
        const re = new RegExp(`^${n.replace(/\*/g,'.*').replace(/\?/g,'.')}$`,'i');
        return re.test(h);
    }else{
        return n == h;
    }
}

function attributeMatches( needle, haystack ){
    if(needle == '*' && haystack !== undefined ){
        return true;
    }else if(needle.includes('|')){
        const vals = needle.split('|');
        return vals.some( val => {
            return compareString(val,haystack);
        })
    }else{
        return compareString(needle,haystack);
    }
}

class AdbElement {
    data;
    attributes = {};

    constructor(data){
        this.data = data;
        if(data['@_bounds']){

            const bounds = JSON.parse('['+data['@_bounds'].replace('][', '],[')+']');
            this.bounds = {
                x: bounds[0][0],
                y: bounds[0][1],
                width: bounds[1][0] - bounds[0][0],
                height: bounds[1][1] - bounds[0][1]
            }
        }

        for(let prop in data){
            if(prop.startsWith('@')){
                this.attributes[prop.substring(2)] = data[prop];
            }
        }


    }

    get children(){
        if(this.data.node){
            return Array.isArray( this.data.node ) ? this.data.node.map(d => new AdbElement(d)) : [new AdbElement( this.data.node )];
        }
    }
}

class AdbElements {
    root;

    constructor(output){
        this.output = output;
        this.initialize();
    }

    extract( conditions ){
        const extracted = [];
        function doExtract( node ){
            let ex = true;
            for(let prop in conditions){
                if(!node['@_'+prop]){ ex = false; break; }
                //Prop Exists
                if(attributeMatches( conditions[prop], node['@_'+prop] )){ continue; }
                //No Match
                ex = false;
                break;
            }
            if(ex) extracted.push(new AdbElement(node));
            if(node.node){
                
                if(Array.isArray(node.node)){
                    node.node.forEach( child => {
                        doExtract(child);
                    });
                }else{
                    doExtract(node.node);
                }
            }
        }
        doExtract(this.json.hierarchy?.node || {});
        return extracted;
    }

    initialize(){
        const options = {
            ignoreAttributes : false
        };

        const parser = new XMLParser(options);
        this.json = parser.parse(this.output);
        this.root = new AdbElement(this.json.hierarchy?.node || {});
    }
}

export default AdbElements;