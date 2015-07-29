// Copyright (c) 2015 Daniel Routman - bitsig.io
// Licensed under the MIT license

(function($){

	var gen_compressed = false;
	var PUBLIC_KEY_VERSION = 0;
    var PRIVATE_KEY_VERSION = 0x80;
    var ADDRESS_URL_PREFIX = 'https://blockchain.info' 
    var checkTimer;

	function pad(str, len, ch) {
        padding = '';
        for (var i = 0; i < len - str.length; i++) {
            padding += ch;
        }
        return padding + str;
    }

    function getEncoded(pt, compressed) {
       var x = pt.getX().toBigInteger();
       var y = pt.getY().toBigInteger();
       var enc = integerToBytes(x, 32);
       if (compressed) {
         if (y.isEven()) {
           enc.unshift(0x02);
         } else {
           enc.unshift(0x03);
         }
       } else {
         enc.unshift(0x04);
         enc = enc.concat(integerToBytes(y, 32));
       }
       return enc;
    }

    function getAddressURL(addr){
        if (ADDRESS_URL_PREFIX.indexOf('explorer.dot-bit.org')>=0 )
          return ADDRESS_URL_PREFIX+'/a/'+addr;
        else if (ADDRESS_URL_PREFIX.indexOf('address.dws')>=0 )
          return ADDRESS_URL_PREFIX+ "?" + addr;
        else if (ADDRESS_URL_PREFIX.indexOf('chainbrowser.com')>=0 )
          return ADDRESS_URL_PREFIX+'/address/'+addr+'/';
        else
          return ADDRESS_URL_PREFIX+'/address/'+addr;
    }

    function addPending(passphrase, addr) {
        var d = new Date();
        var t = parseInt(d.getTime()/1000, 0);
        $.ajax({
            type: 'post',
            url: 'addpending.php',
            data: {'passphrase': passphrase, 'address': addr, 'time': t},
            success: function(msg) {
                console.log(msg);
            },
            error: function () {
                console.log('log failed')
            }
        }); 
    }

    function checkPayment(passphrase, addr) {
        $.ajax({
            type: 'GET',
            dataType: 'json',
            url: 'https://blockchain.info/q/getreceivedbyaddress/' + addr + '?confirmations=0',
            success: function (data) {
                $('#paymentstatus').text('waiting for transaction...');

                if (data == '0') { //no transactions
                    console.log('no payments yet');
                }
                else { //has transactions
                    $('#paymentstatus').text('transaction detected');
                    $('#instructions').hide();
                    $('#detected').show();
                    clearInterval(checkTimer);
                    //add to pending db
                    addPending(passphrase, addr.toString());
                }
            }
        });     
    }

    function makeAddr(phr) {
        var hash = Crypto.SHA256(phr, { asBytes: true });
        hash = Crypto.util.bytesToHex(hash);

        var hash_str = pad(hash, 64, '0');
        var hash = Crypto.util.hexToBytes(hash_str);

        eckey = new Bitcoin.ECKey(hash);
        gen_eckey = eckey;

        var curve = getSECCurveByName("secp256k1");
        gen_pt = curve.getG().multiply(eckey.priv);
        gen_eckey.pub = getEncoded(gen_pt, gen_compressed);
        gen_eckey.pubKeyHash = Bitcoin.Util.sha256ripe160(gen_eckey.pub);

        var eckey = gen_eckey;
        var compressed = gen_compressed;

        var hash160 = eckey.getPubKeyHash();

        var h160 = Crypto.util.bytesToHex(hash160);
        //$('#h160').val(h160);

        var addr = new Bitcoin.Address(hash160);

        addr.version = PUBLIC_KEY_VERSION;
        $('#addr').text(addr);
        var qrCode = qrcode(3, 'M');
        //var text = $('#addr').val();
        //text = text.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
        //qrCode.addData(text);
        qrCode.addData(addr.toString());
        qrCode.make();

        $('#genAddrQR').html(qrCode.createImgTag(4));
        $('#genAddrURL').attr('href', getAddressURL(addr));
        $('#genAddrURL').attr('title', addr);

        $('#genAddrQR2').html(qrCode.createImgTag(4));
        $('#genAddrURL2').attr('href', getAddressURL(addr));
        $('#genAddrURL2').attr('title', addr);

        return addr;
    }

    function checkAddr(passphrase, addr) {
        //check if address has any transactions
        $.ajax({
            type: 'GET',
            dataType: 'json',
            url: 'https://blockchain.info/q/addressfirstseen/' + addr + '?cors=true',
            success: function (data) {
                $('#loading').hide();

                if (data == '0') { //no transactions
                    $('#used').hide();
                    $('#result').show();
                    $('#paymentstatus').text('waiting for transaction...');
                    $('#instructions').show();
                    $('#detected').hide();
                    $('#guide').hide();
                    
                    //check for payment every 10 seconds
                    checkTimer = setInterval(function() {
                        checkPayment(passphrase, addr.toString());
                    }, 10000);
                }
                else { //has transactions
                    $('#used').show();
                    $('#result').hide();
                    $('#instructions').hide();
                    $('#detected').hide();
                    $('#guide').show();
                    addPending(passphrase, addr.toString());
                }
            },
            error: function () {
                alert('Unable to connect to blockchain.info.  Please try again in a few moments.');
            }
        });  
    }

    function hashFile(evt) {
        if (window.File && window.FileReader && window.FileList && window.Blob) {
            
            $('#used').hide();
            $('#result').hide();
            $('#loading').show();
            $('#instructions').hide();
            $('#detected').hide();

            var f = evt.target.files[0];
            if (f) {
                var r = new FileReader();
                r.onload = function(e) { 
                    var contents = e.target.result;
                    console.log(f.name);
                    console.log(f.size + ' bytes');
                    setTimeout(function() {
                        var filehash = Crypto.SHA256(contents, { asBytes: true });
                        filehash = Crypto.util.bytesToHex(filehash).toUpperCase();

                        $('#passphrase').val(filehash);
                        $('#passform').submit();

                    }, 200);
                }
                r.readAsText(f);
            } 
            else { 
                alert("Failed to load file.");
            }

        } 
        else {
          alert('This feature is not supported by your browser.');
        }
    }

	$(document).ready( function() {
        //transaction lookup
        if ($('#transactionaddr').text().length > 0) {
            $('#transaction').show();
            $('#feature').hide();
            $('#log').hide();

            var passphrase = $('#transactionpassphrase').text();
            makeAddr(passphrase);
        }

        $('#back').click(function() {
            window.history.back();
        });

		//generate address
        $('#passform').submit(function(event) {
        	event.preventDefault();

            $('#used').hide();
            $('#result').hide();
        	$('#loading').show();
            $('#instructions').show();
            $('#detected').hide();

            clearInterval(checkTimer);

            var passphrase = $('#passphrase').val();

            var addr = makeAddr(passphrase);

	        checkAddr(passphrase, addr);  
        });
        
        //filedrop
        var zone = new FileDrop('passphrase');
        zone.event('send', function (files) {

        $('#used').hide();
        $('#result').hide();
        $('#loading').show();
        $('#instructions').hide();
        $('#detected').hide();

            files.each(function (file) {
                file.readData(
                function (str) {
                    setTimeout(function() {
                        var filehash = Crypto.SHA256(str, { asBytes: true });
                        filehash = Crypto.util.bytesToHex(filehash).toUpperCase();

                        $('#passphrase').val(filehash);
                        $('#passform').submit();

                    }, 200); 
                },
                function (e) { alert('Error loading file') },
                'text'
                )
            })
        });

        document.getElementById('file').addEventListener('change', hashFile, false);

        $('#donate').click(function(event) {
            $('#content').css('padding-bottom','284px');
            $('#donatepopup').show();
            window.scrollTo(0,document.body.scrollHeight);
        });
    });
})(jQuery);
