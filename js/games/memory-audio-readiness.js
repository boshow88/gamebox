/* Device-local hearing acknowledgement. No room revisions, question data or storage. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.MemoryAudioReadiness=factory();})(typeof window==='object'?window:globalThis,function(){
    'use strict';
    function create(options){
        var epoch=1,tested=false,confirmed=false,busy=false,failed=false,recovering=false,closed=false,pending=null;
        var identity=options.identity||globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-');
        function state(){return {token:identity+':'+epoch,tested:tested,confirmed:confirmed,usable:!!options.ready(),busy:busy,recovering:recovering,status:failed?'unavailable':recovering?'recovering':confirmed&&options.ready()?'confirmed':tested&&options.ready()?'tested':'needed'};}
        function notify(){if(!closed&&options.onChange)options.onChange(state());}
        function invalidate(reason){epoch++;tested=confirmed=false;failed=reason==='unavailable';busy=recovering=false;pending=null;notify();}
        async function test(){if(closed||busy)return false;if(tested||confirmed){epoch++;tested=confirmed=false;}var ticket=epoch;busy=true;failed=false;notify();try{var played=await options.test();if(closed||ticket!==epoch)return false;tested=!!played&&!!options.ready();confirmed=false;failed=!tested;return tested;}catch(_){if(ticket===epoch){tested=confirmed=false;failed=true;}return false;}finally{if(ticket===epoch){busy=false;notify();}}}
        function confirm(){if(closed||busy||!tested||!options.ready()||options.muted())return false;confirmed=true;failed=false;notify();return true;}
        function refresh(){
            if(closed)return Promise.resolve(false);
            if(options.muted()){if(tested||confirmed||busy||recovering)invalidate('muted');return Promise.resolve(false);}
            if(options.ready())return Promise.resolve(true);
            if(!confirmed&&!tested)return Promise.resolve(false);
            if(options.hidden&&options.hidden())return Promise.resolve(false);
            if(pending)return pending;
            var ticket=epoch;recovering=true;notify();
            pending=Promise.resolve().then(options.recover).then(function(ok){if(closed||ticket!==epoch)return false;if(!ok||!options.ready()){invalidate('unavailable');return false;}recovering=false;pending=null;notify();return true;},function(){if(!closed&&ticket===epoch)invalidate('unavailable');return false;});return pending;
        }
        return {state:state,test:test,confirm:confirm,refresh:refresh,repeat:function(){invalidate();},destroy:function(){closed=true;epoch++;pending=null;}};
    }
    return {version:2,create:create};
});
