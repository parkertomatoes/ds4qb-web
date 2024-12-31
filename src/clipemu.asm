        cpu 286
        bits 16
        org 256

; This TSR adds an implementation of the 1700h WINOLDAP 
; clipboard functions used by DOS programs to manipulate
; with the Windows 3.11, 95, and 98 clipboard. 
;
; Instead of interacting with the Windows clipboard, 
; however, it "punches out" to the V86 emulator host
; code by reading from port 4A53h. ds4qb-web intercepts
; the port reads and writes to implement the original 
; DS4QB protocol that communicated by clipboard.
;
; Interrupt registers are passed to the host by storing them
; in a block of memory and sharing the address with the host.
; via a port write. The Javascript host returns values via
; the port read, and the TSR uses the port's value to assign AX.
;
; To build: nasm clipemu.asm -o clipemu.com 
; To install: run CLIPEMU.COM from AUTOEXEC.BAT 

start:
        jmp init ; Initialization code is at the end so it does not stay resident

        align 4
        int2fold dd 0                       ; Old 2FH handler
        clipdata db 42,43,44,45,46,47,48,49,50,51,52,53 ; 12-byte buffer for parameters

int2fhandler:
        ; Implement Windows version check (used by DS4QB)
        cmp ax, 160Ah
        jne handleclip
        mov cx, 42
        mov ax, 0
        iret

handleclip:
        ; Chain to next 2FH service if AX is not in 1700h to 170Ah range
        cmp ax, 1700h ; WINOLDAP functions
        jl chain
        cmp ax, 170Ah 
        jg chain

        ; For clipboard functions, invoke Javascript host via ports
        mov [clipdata], ax
        mov [clipdata+2], bx
        mov [clipdata+4], cx
        mov [clipdata+6], dx
        mov [clipdata+8], es
        mov [clipdata+10], si
        mov dx, 4a53h 
        mov ax, ds
        out dx, ax          ; Resend segment since TSR call changed it
        in ax, dx           ; Invoke JS and get output AX value
        mov dx, [clipdata]  ; JS wrote output DX value to buffer
        iret

chain:
        jmp far [cs:int2fold] ; Chain to previous 2FH handler for other services

end_of_resident: ; End of resident code, initialization code is discarded
        
init:
        jmp init_code 
        installed_msg dd 'Clipboard TSR successfully installed$'

init_code:
        ; Send parameter buffer to emulator
        mov dx, 4a53h 
        mov ax, ds
        out dx, ax ; segment

        mov dx, 4a54h
        lea ax, [clipdata]
        out dx, ax ; offset

        ; Record old 2FH handler
        mov ax, 352fh
        int 21h
        mov word [int2fold + 2], es
        mov word [int2fold], bx

        ; Replace 2FH handler with int2fhandler
        mov ax, 252fh
        mov dx, int2fhandler
        int 21h

        ; Print the message to the screen
        mov ah, 9       
        mov dx, installed_msg   
        int 21h         

        ; Terminate and Stay Resident
        mov ax, 3100h
        mov dx, (end_of_resident - start + 256 + 15) >> 4
        int 21h
